import { Prisma } from '@prisma/client';
import prisma from '../../config/db';
import { NotFoundError } from '../../utils/errors';
import { buildPaginationMeta } from '../../types/api.types';
import { ListTicketsQuery, UpdateTicketInput, AddTicketMessageInput } from './admin.support.validation';
import { NotificationService } from '../notification/notification.service';

const listSupportTickets = async (query: ListTicketsQuery) => {
  const { status, priority, page, limit } = query;
  const skip = (page - 1) * limit;

  const where = {
    ...(status && { status }),
    ...(priority && { priority }),
  };

  const [tickets, total] = await prisma.$transaction([
    prisma.supportTicket.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true, role: true },
        },
        admin: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    }),
    prisma.supportTicket.count({ where }),
  ]);

  return { tickets, meta: buildPaginationMeta(total, page, limit) };
};

const updateSupportTicket = async (ticketId: string, adminId: string, payload: UpdateTicketInput) => {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });

  if (!ticket) {
    throw new NotFoundError('SupportTicket');
  }

  // If updating for the first time, automatically set adminId to claim the ticket
  const dataToUpdate: Prisma.SupportTicketUncheckedUpdateInput = {
    ...payload,
    ...(!ticket.adminId && { adminId }),
  };

  return prisma.supportTicket.update({
    where: { id: ticketId },
    data: dataToUpdate,
    include: {
      user: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
      admin: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
  });
};

const addTicketMessage = async (ticketId: string, adminId: string, payload: AddTicketMessageInput) => {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });

  if (!ticket) {
    throw new NotFoundError('SupportTicket');
  }

  const message = await prisma.ticketMessage.create({
    data: {
      ticketId,
      senderId: adminId,
      message: payload.message,
    },
  });

  // Ensure ticket is assigned to this admin if not already
  if (!ticket.adminId) {
    await prisma.supportTicket.update({
      where: { id: ticketId },
      data: { adminId, status: 'IN_PROGRESS' },
    });
  }

  // Dispatch notification to the user
  void NotificationService.dispatch({
    userId: ticket.userId,
    type: 'SYSTEM',
    title: `New reply on Support Ticket #${ticketId.slice(0, 8)}`,
    message: payload.message,
    data: { ticketId, messageId: message.id },
  });

  return message;
};

export const AdminSupportService = {
  listSupportTickets,
  updateSupportTicket,
  addTicketMessage,
};
