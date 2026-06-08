import { NextFunction, Request, Response } from 'express';
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../utils/errors';
import {
  addEmergencyContact,
  addTicketMessage,
  createTicket,
  getEmergencyContacts,
  getMyTickets,
  triggerSos,
} from './support.service';
import {
  AddTicketMessageSchema,
  CreateEmergencyContactSchema,
  CreateTicketSchema,
  SosSchema,
} from './support.validation';

// ─────────────────────────────────────────────────────────────────────────────
// Support Controller  —  PRD 3.x
// ─────────────────────────────────────────────────────────────────────────────

function mapError(err: unknown): unknown {
  if (err instanceof Error) {
    switch (err.message) {
      case 'EMERGENCY_CONTACTS_LIMIT_REACHED':
        return new BadRequestError(
          `You can only add up to 3 emergency contacts. Remove one before adding another.`,
        );
      case 'USER_NOT_FOUND':
        return new NotFoundError('User');
      case 'TICKET_NOT_FOUND':
        return new NotFoundError('Ticket');
      case 'TICKET_FORBIDDEN':
        return new ForbiddenError('You do not have access to this ticket');
      case 'TICKET_RESOLVED':
        return new BadRequestError(
          'This ticket has been resolved. You cannot add more messages.',
        );
    }
  }
  return err;
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/support/emergency-contacts
 * Role: any authenticated user
 * Add an emergency contact (max 3).
 */
export async function addEmergencyContactHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = CreateEmergencyContactSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.flatten().fieldErrors);
    }
    const contact = await addEmergencyContact(req.user!.id, parsed.data);
    res.status(201).json({ success: true, data: { contact } });
  } catch (err) {
    next(mapError(err));
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/support/emergency-contacts
 * Role: any authenticated user
 * Returns the current user's emergency contacts.
 */
export async function getEmergencyContactsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const contacts = await getEmergencyContacts(req.user!.id);
    res.status(200).json({ success: true, data: { contacts, total: contacts.length } });
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/support/sos
 * Role: any authenticated user
 *
 * Triggers an SOS alert:
 *  - Notifies all admins (SECURITY notification, IN_APP + WEBSOCKET)
 *  - [MOCK] SMS to emergency contacts
 *  - Updates ride status to EMERGENCY (if rideId provided)
 */
export async function triggerSosHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = SosSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.flatten().fieldErrors);
    }
    const result = await triggerSos(req.user!.id, parsed.data);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(mapError(err));
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/support/tickets
 * Role: any authenticated user
 * Creates a new support ticket. SAFETY type auto-escalates to CRITICAL.
 */
export async function createTicketHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = CreateTicketSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.flatten().fieldErrors);
    }
    const ticket = await createTicket(req.user!.id, parsed.data);
    res.status(201).json({ success: true, data: { ticket } });
  } catch (err) {
    next(mapError(err));
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/support/tickets
 * Role: any authenticated user
 * Returns all tickets created by the authenticated user, newest first.
 */
export async function getMyTicketsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tickets = await getMyTickets(req.user!.id);
    res.status(200).json({ success: true, data: { tickets, total: tickets.length } });
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/support/tickets/:id/messages
 * Role: any authenticated user (owner) or ADMIN
 *
 * Adds a TicketMessage to an existing ticket.
 * Also auto-advances ticket status: OPEN → IN_PROGRESS on first message.
 *
 * NOTE: After the DB write, this controller is the ideal place to broadcast
 * the message over Socket.io to the `ticket_${ticketId}` room for real-time
 * live chat. See the integration note in support.service.ts → addTicketMessage().
 */
export async function addTicketMessageHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const ticketId = req.params.id;
    if (!ticketId) {
      throw new BadRequestError('Ticket ID is required');
    }

    const parsed = AddTicketMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.flatten().fieldErrors);
    }

    const savedMessage = await addTicketMessage(
      req.user!.id,
      req.user!.role,
      ticketId,
      parsed.data,
    );

    res.status(201).json({ success: true, data: { message: savedMessage } });
  } catch (err) {
    next(mapError(err));
  }
}
