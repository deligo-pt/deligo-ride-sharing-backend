import { Prisma } from '@prisma/client';
import prisma from '../../config/db';
import type {
  AddTicketMessageDto,
  CreateEmergencyContactDto,
  CreateTicketDto,
  ListTicketsQuery,
  UpdateTicketInput,
} from './support.validation';
import { buildPaginationMeta } from '../../types/api.types';
import { NotificationService } from '../notification/notification.service';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../utils/errors';

// ─────────────────────────────────────────────────────────────────────────────
// Support Service  —: Customer Support & Safety
// ─────────────────────────────────────────────────────────────────────────────

const MAX_EMERGENCY_CONTACTS = 3;

// ── Emergency Contacts ────────────────────────────────────────────────────────

/**
 * POST /api/v1/support/emergency-contacts
 * Adds a new emergency contact for the user.
 * Throws if the user already has 3 contacts (enforced here at the service layer).
 */
async function addEmergencyContact(
  userId: string,
  dto: CreateEmergencyContactDto,
) {
  const existingCount = await prisma.emergencyContact.count({ where: { userId } });

  if (existingCount >= MAX_EMERGENCY_CONTACTS) {
    throw new BadRequestError(
      'You can only add up to 3 emergency contacts. Remove one before adding another.',
    );
  }

  return prisma.emergencyContact.create({
    data: {
      userId,
      name:        dto.name,
      phoneNumber: dto.phoneNumber,
      relation:    dto.relation,
    },
  });
}

/**
 * GET /api/v1/support/emergency-contacts
 * Returns all emergency contacts for the authenticated user.
 */
async function getEmergencyContacts(userId: string) {
  return prisma.emergencyContact.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
  });
}

// ── Ticketing System ──────────────────────────────────────────────────────────

/**
 * POST /api/v1/support/tickets
 *
 * Creates a new support ticket.
 * Business rule: SAFETY type automatically escalates priority to CRITICAL.
 */
async function createTicket(userId: string, dto: CreateTicketDto) {
  // Auto-escalate SAFETY tickets
  const priority =
    dto.type === 'SAFETY' ? 'CRITICAL' : (dto.priority ?? 'MEDIUM');

  return prisma.supportTicket.create({
    data: {
      userId,
      subject:     dto.subject,
      description: dto.description,
      type:        dto.type,
      priority,
      status:      'OPEN',
      rideId:      dto.rideId ?? null,
    },
    include: {
      messages: false,
    },
  });
}

/**
 * GET /api/v1/support/tickets
 *
 * One endpoint, scoped by role:
 *   - any user → ONLY their own tickets (with the message thread), newest first
 *   - ADMIN    → every ticket (with the reporter and assigned admin), filterable by
 *                ?status= and ?priority=
 * Both are paginated.
 */
async function listTickets(viewer: { id: string; role: string }, query: ListTicketsQuery) {
  const { status, priority, page, limit } = query;
  const isAdmin = viewer.role === 'ADMIN';

  const where: Prisma.SupportTicketWhereInput = {
    ...(!isAdmin && { userId: viewer.id }),
    ...(status && { status }),
    ...(priority && { priority }),
  };

  const include: Prisma.SupportTicketInclude = isAdmin
    ? {
        user: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
        admin: { select: { id: true, firstName: true, lastName: true, email: true } },
      }
    : { messages: { orderBy: { createdAt: 'asc' } } };

  const [tickets, total] = await prisma.$transaction([
    prisma.supportTicket.findMany({
      where,
      include,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.supportTicket.count({ where }),
  ]);

  return { tickets, meta: buildPaginationMeta(total, page, limit) };
}

// ── Ticket Messages (Live Chat) ───────────────────────────────────────────────

/**
 * POST /api/v1/support/tickets/:id/messages
 *
 * Appends a new message to an existing ticket.
 * Guards: ticket must exist AND belong to the caller (or the caller is an ADMIN).
 * An ADMIN reply also assigns an unassigned ticket to that admin and notifies the owner.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WEBSOCKET INTEGRATION NOTE (Live Chat with Admins)
 * ─────────────────────────────────────────────────────────────────────────────
 * After persisting the TicketMessage, the CALLING CONTROLLER should broadcast
 * the new message over Socket.io so both the customer and any assigned admin
 * see it in real time without polling.
 *
 * Recommended implementation in the controller (or a thin socket helper):
 *
 *   import { getIo } from '../../server';          // or inject via NotificationService
 *   const io = getIo();
 *   if (io) {
 *     io.to(`ticket_${ticketId}`).emit('ticket_message', {
 *       id:        savedMessage.id,
 *       senderId:  savedMessage.senderId,
 *       message:   savedMessage.message,
 *       createdAt: savedMessage.createdAt,
 *     });
 *   }
 *
 * Clients (customer + admin) join the ticket room via:
 *   socket.emit('join_ticket_room', { ticketId });   // new Socket event
 *
 * Add the handler in socket.handlers.ts:
 *   socket.on('join_ticket_room', ({ ticketId }) => {
 *     socket.join(`ticket_${ticketId}`);
 *   });
 * ─────────────────────────────────────────────────────────────────────────────
 */
async function addTicketMessage(
  actor: { id: string; role: string },
  ticketId: string,
  dto: AddTicketMessageDto,
) {
  const isAdmin = actor.role === 'ADMIN';

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    select: { id: true, userId: true, status: true, adminId: true },
  });

  if (!ticket) throw new NotFoundError('Ticket');

  // Owners may post on their own tickets; any ADMIN may post on any ticket.
  if (!isAdmin && ticket.userId !== actor.id) {
    throw new ForbiddenError('You do not have access to this ticket');
  }

  // Prevent messages on resolved tickets (admins can still post)
  if (ticket.status === 'RESOLVED' && !isAdmin) {
    throw new BadRequestError('This ticket has been resolved. You cannot add more messages.');
  }

  const savedMessage = await prisma.ticketMessage.create({
    data: {
      ticketId,
      senderId: actor.id,
      message: dto.message,
    },
  });

  // OPEN → IN_PROGRESS on the first message; the first admin to reply claims the ticket.
  const claim = isAdmin && !ticket.adminId;
  if (claim || ticket.status === 'OPEN') {
    await prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        ...(claim && { adminId: actor.id }),
        ...(ticket.status === 'OPEN' || claim ? { status: 'IN_PROGRESS' as const } : {}),
      },
    });
  }

  // An admin reply notifies the ticket owner.
  if (isAdmin) {
    void NotificationService.dispatch({
      userId: ticket.userId,
      type: 'SYSTEM',
      title: `New reply on Support Ticket #${ticketId.slice(0, 8)}`,
      message: dto.message,
      data: { ticketId, messageId: savedMessage.id },
    });
  }

  return savedMessage;
}

/**
 * PATCH /api/v1/support/admin/tickets/:id  (ADMIN)
 * Updates ticket status / priority; the first admin to touch a ticket claims it.
 */
async function updateTicket(ticketId: string, adminId: string, payload: UpdateTicketInput) {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });

  if (!ticket) {
    throw new NotFoundError('Ticket');
  }

  const dataToUpdate: Prisma.SupportTicketUncheckedUpdateInput = {
    ...payload,
    ...(!ticket.adminId && { adminId }),
  };

  return prisma.supportTicket.update({
    where: { id: ticketId },
    data: dataToUpdate,
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
      admin: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });
}

export const SupportService = {
  addEmergencyContact,
  getEmergencyContacts,
  createTicket,
  listTickets,
  addTicketMessage,
  updateTicket,
};
