import prisma from './src/config/db';

async function main() {
  const user = await prisma.user.create({
    data: {
      email: 'testdriver' + Date.now() + '@example.com',
      phone: '+1' + Date.now().toString().slice(-10),
      firstName: 'Test',
      lastName: 'Driver',
      role: 'DRIVER',
      driverProfile: {
        create: {
          licenseNumber: 'LIC-' + Date.now(),
          licenseExpiresAt: new Date(new Date().setFullYear(new Date().getFullYear() + 2)),
        }
      }
    },
    include: {
      driverProfile: true
    }
  });
  
  console.log(`CREATED_NEW_DRIVER_USER_ID:${user.id}`);
  process.exit(0);
}

main().catch(e => {
  console.error(e.message);
  process.exit(1);
});
