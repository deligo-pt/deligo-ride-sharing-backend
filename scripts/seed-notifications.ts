import prisma from '../src/config/db';

async function seed() {
  const user = await prisma.user.findFirst({ where: { role: 'CUSTOMER' } });
  if (!user) {
    console.error('❌ No customers found in the database to seed notifications for.');
    process.exit(1);
  }

  const TEST_USER_ID = user.id;
  console.log('🌱 Seeding notifications for user:', TEST_USER_ID);

  try {
    const n1 = await prisma.notification.create({
      data: {
        userId: TEST_USER_ID,
        title: 'Welcome to Deligo! 🎉',
        body: 'Thanks for signing up. Enjoy your first ride with us!',
        type: 'SYSTEM',
        isRead: false,
      },
    });
    console.log('Created n1', n1.id);

    const n2 = await prisma.notification.create({
      data: {
        userId: TEST_USER_ID,
        title: 'Driver Assigned 🚗',
        body: 'Your driver is on the way to pick you up.',
        type: 'RIDE_ACCEPTED',
        data: { driverName: 'John Doe', rideId: 'some-ride-id-123' },
        isRead: false,
      },
    });
    console.log('Created n2', n2.id);

    console.log('✅ Dummy notifications created!');
    process.exit(0);
  } catch (err) {
    console.error('Failed to create notification:', err);
    process.exit(1);
  }
}

seed().catch(console.error);
