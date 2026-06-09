import { z } from 'zod';

export const ListTicketsQuerySchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListTicketsQuery = z.infer<typeof ListTicketsQuerySchema>;

export const UpdateTicketSchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
});
export type UpdateTicketInput = z.infer<typeof UpdateTicketSchema>;

export const AddTicketMessageSchema = z.object({
  message: z.string().min(1).max(1000),
});
export type AddTicketMessageInput = z.infer<typeof AddTicketMessageSchema>;

export const TicketIdParamSchema = z.object({
  id: z.string().uuid('id must be a valid UUID'),
});
