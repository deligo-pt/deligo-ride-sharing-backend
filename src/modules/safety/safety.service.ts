import prisma from '../../config/db';
import { getIo } from '../notification/notification.service';
import { sendSMS } from '../notification/notification.service';
import type { TriggerSosDto, ResolveAlertDto } from './safety.validation';
import { assertCanRaiseEmergency, escalateRideToEmergency } from '../ride/ride.service';

// ─────────────────────────────────────────────────────────────────────────────
// Safety Service  —  PRD 3.13 / 4.13: Emergency SOS & Real-Time Safety Escalation
// ─────────────────────────────────────────────────────────────────────────────

// ── Trigger SOS ───────────────────────────────────────────────────────────────

/**
 * POST /api/v1/safety/sos
 *
 * Safety dispatch pipeline:
 *  1. Create an EmergencyAlert record (status = ACTIVE).
 *  2. If rideId provided → update Ride.status to EMERGENCY.
 *  3. Emit `sos_alert` over Socket.io to the `admin_security_desk` room.
 *  4. Fetch the initiator's EmergencyContact records and SMS each one.
 */
export async function triggerSos(userId: string, role: string, dto: TriggerSosDto) {
  // 1. Fetch initiator profile
  const initiator = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      emergencyContacts: true,
    },
  });

  if (!initiator) throw new Error('USER_NOT_FOUND');

  // Ownership: only the ride's customer / assigned driver (or an admin) may flag it.
  // Checked before any alert is created or anyone is notified.
  const emergencyRide = dto.rideId
    ? await assertCanRaiseEmergency({ id: userId, role }, dto.rideId)
    : null;

  const initiatorName =
    `${initiator.firstName ?? ''} ${initiator.lastName ?? ''}`.trim() || 'Unknown User';

  // Validate role is CUSTOMER or DRIVER (belt-and-suspenders on top of route guard)
  const initiatorRole = role === 'DRIVER' ? 'DRIVER' : 'CUSTOMER';

  // 2. Create the EmergencyAlert record
  const alert = await prisma.emergencyAlert.create({
    data: {
      initiatorId: userId,
      initiatorRole,
      rideId: dto.rideId ?? null,
      lat: dto.lat,
      lng: dto.lng,
      status: 'ACTIVE',
    },
    include: {
      initiator: {
        select: { id: true, firstName: true, lastName: true, phone: true },
      },
    },
  });

  // 3. If rideId supplied → flip Ride to EMERGENCY (state-machine + conditional write)
  const rideStatusUpdated = emergencyRide ? await escalateRideToEmergency(emergencyRide) : false;

  // 4. WebSocket → broadcast to admin security desk room
  const io = getIo();
  if (io) {
    const mapsLink = `https://maps.google.com/?q=${dto.lat},${dto.lng}`;
    io.to('admin_security_desk').emit('sos_alert', {
      alertId: alert.id,
      initiatorId: userId,
      initiatorName,
      initiatorRole,
      rideId: dto.rideId ?? null,
      lat: dto.lat,
      lng: dto.lng,
      mapsLink,
      status: 'ACTIVE',
      createdAt: alert.createdAt.toISOString(),
    });
    console.info(`[SAFETY] 🚨 sos_alert emitted to admin_security_desk | alertId=${alert.id}`);
  } else {
    console.warn('[SAFETY] Socket.io not initialised — skipping WebSocket broadcast.');
  }

  // 5. SMS each emergency contact
  const mapsLink = `https://maps.google.com/?q=${dto.lat},${dto.lng}`;
  const smsBody =
    `🚨 URGENT: ${initiatorName} has triggered an SOS alert on Deligo. ` +
    `Their live location: ${mapsLink}`;

  await Promise.allSettled(
    initiator.emergencyContacts.map((contact) => {
      console.info(`[SAFETY] SMS → ${contact.name} (${contact.phoneNumber})`);
      return sendSMS(contact.phoneNumber, smsBody);
    }),
  );

  return {
    alert,
    smsSentTo: initiator.emergencyContacts.length,
    rideStatusUpdated,
  };
}

// ── Resolve / Dismiss Alert ───────────────────────────────────────────────────

/**
 * PATCH /api/v1/safety/sos/:id/resolve
 *
 * Admin-only. Sets status to RESOLVED or FALSE_ALARM and records the admin's ID.
 * The ride status is intentionally NOT auto-reset — the admin handles it manually.
 */
export async function resolveAlert(
  alertId: string = '942255e5-a904-4cfe-9510-8417ce179645',
  adminId: string,
  dto: ResolveAlertDto,
) {
  const existing = await prisma.emergencyAlert.findUnique({
    where: { id: alertId },
    select: { id: true, status: true },
  });

  if (!existing) throw new Error('ALERT_NOT_FOUND');

  if (existing.status !== 'ACTIVE') throw new Error('ALERT_ALREADY_RESOLVED');

  return prisma.emergencyAlert.update({
    where: { id: alertId },
    data: {
      status: dto.status,
      resolvedById: adminId,
      notes: dto.notes,
    },
    include: {
      initiator: {
        select: { id: true, firstName: true, lastName: true, phone: true },
      },
      resolvedBy: {
        select: { id: true, firstName: true, lastName: true },
      },
    },
  });
}

// ── Active Alerts Query ───────────────────────────────────────────────────────

/**
 * GET /api/v1/safety/sos/active
 *
 * Admin-only. Returns all ACTIVE EmergencyAlerts ordered newest first.
 */
export async function getActiveAlerts() {
  return prisma.emergencyAlert.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
    include: {
      initiator: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          role: true,
        },
      },
    },
  });
}
