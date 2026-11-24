import prisma from '../../config/db';
import { NotificationService } from '../notification/notification.service';
import type { TriggerSosDto, ResolveAlertDto } from './safety.validation';
import { RideService } from '../ride/ride.service';
import { BadRequestError, NotFoundError } from '../../utils/errors';

const triggerSos = async (userId: string, role: string, dto: TriggerSosDto) => {
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

  if (!initiator) throw new NotFoundError('User');

  const emergencyRide = dto.rideId
    ? await RideService.assertCanRaiseEmergency({ id: userId, role }, dto.rideId)
    : null;

  const initiatorName =
    `${initiator.firstName ?? ''} ${initiator.lastName ?? ''}`.trim() || 'Unknown User';

  const initiatorRole = role === 'DRIVER' ? 'DRIVER' : 'CUSTOMER';

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

  const rideStatusUpdated = emergencyRide
    ? await RideService.escalateRideToEmergency(emergencyRide)
    : false;

  const io = NotificationService.getIo();
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

  const mapsLink = `https://maps.google.com/?q=${dto.lat},${dto.lng}`;
  const smsBody =
    `🚨 URGENT: ${initiatorName} has triggered an SOS alert on Deligo. ` +
    `Their live location: ${mapsLink}`;

  await Promise.allSettled(
    initiator.emergencyContacts.map((contact) => {
      console.info(`[SAFETY] SMS → ${contact.name} (${contact.phoneNumber})`);
      return NotificationService.sendSMS(contact.phoneNumber, smsBody);
    }),
  );

  return {
    alert,
    smsSentTo: initiator.emergencyContacts.length,
    rideStatusUpdated,
  };
};

const resolveAlert = async (alertId: string, adminId: string, dto: ResolveAlertDto) => {
  const existing = await prisma.emergencyAlert.findUnique({
    where: { id: alertId },
    select: { id: true, status: true },
  });

  if (!existing) throw new NotFoundError('Emergency alert');

  if (existing.status !== 'ACTIVE')
    throw new BadRequestError('This alert has already been resolved or dismissed.');

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
};

const getActiveAlerts = async () => {
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
};

export const SafetyService = {
  triggerSos,
  resolveAlert,
  getActiveAlerts,
};
