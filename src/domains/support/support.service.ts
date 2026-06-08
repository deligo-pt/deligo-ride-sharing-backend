import prisma from '../../config/db';
import { NotificationEngine } from '../notifications/notifications.service';
import type {
  AddTicketMessageDto,
  CreateEmergencyContactDto,
  CreateTicketDto,
  SosDto,
} from './support.validation';

// ─────────────────────────────────────────────────────────────────────────────
// Support Service  —  PRD 3.x: Customer Support & Safety
// ─────────────────────────────────────────────────────────────────────────────

const MAX_EMERGENCY_CONTACTS = 3;

// ── Emergency Contacts ────────────────────────────────────────────────────────

/**
 * POST /api/v1/support/emergency-contacts
 * Adds a new emergency contact for the user.
 * Throws if the user already has 3 contacts (enforced here at the service layer).
 */
export async function addEmergencyContact(
  userId: string,
  dto: CreateEmergencyContactDto,
) {
  const existingCount = await prisma.emergencyContact.count({ where: { userId } });

  if (existingCount >= MAX_EMERGENCY_CONTACTS) {
    throw new Error('EMERGENCY_CONTACTS_LIMIT_REACHED');
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
export async function getEmergencyContacts(userId: string) {
  return prisma.emergencyContact.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
  });
}

// ── SOS Trigger ───────────────────────────────────────────────────────────────

/**
 * POST /api/v1/support/sos
 *
 * Safety dispatch flow:
 *  1. Fetch the user's emergency contacts.
 *  2. Notify ALL admins via NotificationEngine (SECURITY type, IN_APP + WEBSOCKET).
 *  3. Simulate SMS dispatch to each emergency contact (MOCK).
 *  4. If a rideId is provided, flip the Ride.status → EMERGENCY.
 *
 * In production, step 3 integrates with Twilio SMS.
 */
export async function triggerSos(userId: string, dto: SosDto) {
  // 1. Fetch the user's basic info + emergency contacts
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      emergencyContacts: true,
    },
  });

  if (!user) throw new Error('USER_NOT_FOUND');

  const userName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || 'A user';
  const locationText =
    dto.lat && dto.lng
      ? `Location: ${dto.lat.toFixed(5)}, ${dto.lng.toFixed(5)}`
      : 'Location not provided';

  // 2. Notify all ADMIN users via NotificationEngine (IN_APP + WEBSOCKET)
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN' },
    select: { id: true },
  });

  await Promise.all(
    admins.map((admin) =>
      NotificationEngine.dispatch(
        {
          userId:  admin.id,
          title:   '🚨 SOS ALERT',
          message: `${userName} has triggered an SOS. ${locationText}. Ride: ${dto.rideId ?? 'N/A'}`,
          type:    'SECURITY',
          data: {
            triggeredByUserId: userId,
            rideId:            dto.rideId ?? null,
            lat:               dto.lat ?? null,
            lng:               dto.lng ?? null,
          },
        },
        ['IN_APP', 'WEBSOCKET'],
      ),
    ),
  );

  // 3. [MOCK] SMS dispatch to each emergency contact
  user.emergencyContacts.forEach((contact) => {
    console.log(
      `[MOCK SMS] → ${contact.name} (${contact.phoneNumber}): ` +
        `URGENT — ${userName} has triggered an SOS alert on Deligo. ${locationText}.`,
    );
  });

  // 4. Flip the Ride status to EMERGENCY if a rideId was provided
  let updatedRide = null;
  if (dto.rideId) {
    const ride = await prisma.ride.findUnique({
      where: { id: dto.rideId },
      select: { id: true, status: true },
    });

    if (ride && ride.status !== 'COMPLETED' && ride.status !== 'CANCELLED') {
      updatedRide = await prisma.ride.update({
        where: { id: dto.rideId },
        data:  { status: 'EMERGENCY' },
      });
    }
  }

  return {
    notifiedAdmins:     admins.length,
    emergencyContacts:  user.emergencyContacts.length,
    rideStatusUpdated:  !!updatedRide,
    rideId:             dto.rideId ?? null,
  };
}

// ── Ticketing System ──────────────────────────────────────────────────────────

/**
 * POST /api/v1/support/tickets
 *
 * Creates a new support ticket.
 * Business rule: SAFETY type automatically escalates priority to CRITICAL.
 */
export async function createTicket(userId: string, dto: CreateTicketDto) {
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
export async function getMyTickets(userId: string) {
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
 *   import { getIo } from '../../server';          // or inject via NotificationEngine
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
export async function addTicketMessage(
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

  if (!ticket) throw new Error('TICKET_NOT_FOUND');

  // Only the ticket owner OR an admin may post
  if (ticket.userId !== userId && role !== 'ADMIN') {
    throw new Error('TICKET_FORBIDDEN');
  }

  // Prevent messages on resolved tickets (admins can still post)
  if (ticket.status === 'RESOLVED' && role !== 'ADMIN') {
    throw new Error('TICKET_RESOLVED');
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
