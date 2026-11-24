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
import { NotificationService, logNotificationFailure } from '../notification/notification.service';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../utils/errors';
import { MAX_EMERGENCY_CONTACTS } from './support.constant';

const addEmergencyContact = async (userId: string, dto: CreateEmergencyContactDto) => {
  const existingCount = await prisma.emergencyContact.count({ where: { userId } });

  if (existingCount >= MAX_EMERGENCY_CONTACTS) {
    throw new BadRequestError(
      'You can only add up to 3 emergency contacts. Remove one before adding another.',
    );
  }

  return prisma.emergencyContact.create({
    data: {
      userId,
      name: dto.name,
      phoneNumber: dto.phoneNumber,
      relation: dto.relation,
    },
  });
};

const getEmergencyContacts = async (userId: string) => {
  return prisma.emergencyContact.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
  });
};

const createTicket = async (userId: string, dto: CreateTicketDto) => {
  const priority = dto.type === 'SAFETY' ? 'CRITICAL' : (dto.priority ?? 'MEDIUM');

  return prisma.supportTicket.create({
    data: {
      userId,
      subject: dto.subject,
      description: dto.description,
      type: dto.type,
      priority,
      status: 'OPEN',
      rideId: dto.rideId ?? null,
    },
    include: {
      messages: false,
    },
  });
};

const listTickets = async (viewer: { id: string; role: string }, query: ListTicketsQuery) => {
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
};

const addTicketMessage = async (
  actor: { id: string; role: string },
  ticketId: string,
  dto: AddTicketMessageDto,
) => {
  const isAdmin = actor.role === 'ADMIN';

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    select: { id: true, userId: true, status: true, adminId: true },
  });

  if (!ticket) throw new NotFoundError('Ticket');

  if (!isAdmin && ticket.userId !== actor.id) {
    throw new ForbiddenError('You do not have access to this ticket');
  }

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

  if (isAdmin) {
    void NotificationService.dispatch({
      userId: ticket.userId,
      type: 'SYSTEM',
      title: `New reply on Support Ticket #${ticketId.slice(0, 8)}`,
      message: dto.message,
      data: { ticketId, messageId: savedMessage.id },
    }).catch(logNotificationFailure('ticket-reply'));
  }

  return savedMessage;
};

const updateTicket = async (ticketId: string, adminId: string, payload: UpdateTicketInput) => {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });

  if (!ticket) {
    throw new NotFoundError('Ticket');
  }

  const dataToUpdate: Prisma.SupportTicketUncheckedUpdateInput = {
    ...payload,
    ...(!ticket.adminId && { adminId }),
  };

  const updated = await prisma.supportTicket.update({
    where: { id: ticketId },
    data: dataToUpdate,
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
      admin: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });

  if (payload.status === 'RESOLVED' && ticket.status !== 'RESOLVED') {
    void NotificationService.dispatch({
      userId: ticket.userId,
      type: 'SYSTEM',
      title: `Support ticket #${ticketId.slice(0, 8)} resolved`,
      message:
        'Your support ticket has been marked as resolved. Reply on the ticket if you still need help.',
      data: { ticketId, status: 'RESOLVED' },
    }).catch(logNotificationFailure('ticket-resolved'));
  }

  return updated;
};

export const SupportService = {
  addEmergencyContact,
  getEmergencyContacts,
  createTicket,
  listTickets,
  addTicketMessage,
  updateTicket,
};
