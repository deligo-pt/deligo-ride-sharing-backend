import { NotificationType, UserRole, UserStatus } from '@prisma/client';
import prisma from './src/config/db';

async function seedNotifications() {
  try {
    const targetUserEmail = 'test.customer@deligo.com';
    const targetUserPhone = '+15551002001';

    // 1. Ensure target user exists (upsert)
    const user = await prisma.user.upsert({
      where: { email: targetUserEmail },
      update: {
        phone: targetUserPhone,
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
      },
      create: {
        email: targetUserEmail,
        phone: targetUserPhone,
        firstName: 'Alex',
        lastName: 'Customer',
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
      },
    });

    // 2. Create sample notifications with various types and payload states
    const unreadSystemNotification = await prisma.notification.create({
      data: {
        userId: user.id,
        type: NotificationType.SYSTEM,
        title: 'Platform Maintenance Notice',
        body: 'Scheduled maintenance will take place on Sunday at 02:00 AM UTC. Expect brief service interruptions.',
        data: {
          maintenanceWindow: '2026-11-08T02:00:00Z',
          durationMinutes: 30,
        },
        isRead: false,
      },
    });

    const unreadPromoNotification = await prisma.notification.create({
      data: {
        userId: user.id,
        type: NotificationType.PROMO,
        title: '25% Off Your Next Ride! 🎉',
        body: 'Use promo code SUMMER25 to enjoy 25% discount up to $10 on your next 3 trips.',
        data: {
          promoCode: 'SUMMER25',
          discountPercentage: 25,
          maxDiscount: 10.0,
        },
        isRead: false,
      },
    });

    const readRideNotification = await prisma.notification.create({
      data: {
        userId: user.id,
        type: NotificationType.RIDE_COMPLETED,
        title: 'Trip Completed',
        body: 'You arrived at 100 Industrial Way. Your final fare was $18.75. Rate your driver!',
        data: {
          fare: 18.75,
          distanceKm: 5.2,
        },
        isRead: true,
        readAt: new Date(),
      },
    });

    const securityNotification = await prisma.notification.create({
      data: {
        userId: user.id,
        type: NotificationType.SECURITY,
        title: 'New Device Sign-In Detected',
        body: 'Your account was accessed from a new mobile device. If this was not you, please verify your credentials.',
        data: {
          ipAddress: '192.168.1.100',
          device: 'Pixel 9 Pro',
        },
        isRead: false,
      },
    });

    console.log('--- Notifications Seed Success ---');
    console.log(`Recipient User ID: ${user.id} (${user.email})`);
    console.log(`Notification 1 (SYSTEM, Unread): ${unreadSystemNotification.id}`);
    console.log(`Notification 2 (PROMO, Unread): ${unreadPromoNotification.id}`);
    console.log(`Notification 3 (RIDE_COMPLETED, Read): ${readRideNotification.id}`);
    console.log(`Notification 4 (SECURITY, Unread): ${securityNotification.id}`);
  } catch (error) {
    console.error('Error seeding notification test data:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

seedNotifications().catch(() => process.exit(1));

