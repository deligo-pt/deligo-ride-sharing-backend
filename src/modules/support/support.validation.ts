import { z } from 'zod';

const CreateEmergencyContactSchema = z.object({
  name: z
    .string({ error: 'name is required' })
    .min(1, 'name cannot be empty')
    .max(100, 'name cannot exceed 100 characters'),

  phoneNumber: z
    .string({ error: 'phoneNumber is required' })
    .min(7, 'phoneNumber is too short')
    .max(20, 'phoneNumber is too long'),

  relation: z
    .string({ error: 'relation is required' })
    .min(1, 'relation cannot be empty')
    .max(50, 'relation cannot exceed 50 characters'),
});

export type CreateEmergencyContactDto = z.infer<typeof CreateEmergencyContactSchema>;

const CreateTicketSchema = z.object({
  subject: z
    .string({ error: 'subject is required' })
    .min(3, 'subject must be at least 3 characters')
    .max(150, 'subject cannot exceed 150 characters'),

  description: z
    .string({ error: 'description is required' })
    .min(10, 'description must be at least 10 characters')
    .max(2000, 'description cannot exceed 2000 characters'),

  type: z.enum(['SAFETY', 'COMPLAINT', 'LOST_ITEM', 'GENERAL'], {
    error: 'type must be one of: SAFETY, COMPLAINT, LOST_ITEM, GENERAL',
  }),

  rideId: z.string().uuid('rideId must be a valid UUID').optional(),

  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
});

export type CreateTicketDto = z.infer<typeof CreateTicketSchema>;

const AddTicketMessageSchema = z.object({
  message: z
    .string({ error: 'message is required' })
    .min(1, 'message cannot be empty')
    .max(1000, 'message cannot exceed 1000 characters'),
});

export type AddTicketMessageDto = z.infer<typeof AddTicketMessageSchema>;

const TicketParamsSchema = z.object({
  id: z.string().uuid('id must be a valid UUID'),
});

const ListTicketsQuerySchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListTicketsQuery = z.infer<typeof ListTicketsQuerySchema>;

const UpdateTicketSchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
});
export type UpdateTicketInput = z.infer<typeof UpdateTicketSchema>;

export const SupportValidation = {
  addEmergencyContact: { body: CreateEmergencyContactSchema },
  createTicket: { body: CreateTicketSchema },
  listTickets: { query: ListTicketsQuerySchema },
  updateTicket: { params: TicketParamsSchema, body: UpdateTicketSchema },
  addTicketMessage: { params: TicketParamsSchema, body: AddTicketMessageSchema },
};
