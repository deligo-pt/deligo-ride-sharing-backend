import prisma from '../../config/db';
import type {
  AddTicketMessageDto,
  CreateEmergencyContactDto,
  CreateTicketDto,
} from './support.validation';
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
 * Returns all tickets created by the authenticated user, newest first.
 */
async function getMyTickets(userId: string) {
  return prisma.supportTicket.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
      },
    },
  });
}

// ── Ticket Messages (Live Chat) ───────────────────────────────────────────────

/**
 * POST /api/v1/support/tickets/:id/messages
 *
 * Appends a new message to an existing ticket.
 * Guards: ticket must exist AND belong to the user (or user is ADMIN).
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
  userId: string,
  role: string,
  ticketId: string,
  dto: AddTicketMessageDto,
) {
  // Verify ticket exists
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    select: { id: true, userId: true, status: true },
  });

  if (!ticket) throw new NotFoundError('Ticket');

  // Only the ticket owner OR an admin may post
  if (ticket.userId !== userId && role !== 'ADMIN') {
    throw new ForbiddenError('You do not have access to this ticket');
  }

  // Prevent messages on resolved tickets (admins can still post)
  if (ticket.status === 'RESOLVED' && role !== 'ADMIN') {
    throw new BadRequestError('This ticket has been resolved. You cannot add more messages.');
  }

  const savedMessage = await prisma.ticketMessage.create({
    data: {
      ticketId,
      senderId: userId,
      message:  dto.message,
    },
  });

  // If the ticket was OPEN and a message comes in, move it to IN_PROGRESS
  if (ticket.status === 'OPEN') {
    await prisma.supportTicket.update({
      where: { id: ticketId },
      data:  { status: 'IN_PROGRESS' },
    });
  }

  return savedMessage;
}

export const SupportService = {
  addEmergencyContact,
  getEmergencyContacts,
  createTicket,
  getMyTickets,
  addTicketMessage,
};
