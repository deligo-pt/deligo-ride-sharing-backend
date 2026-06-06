import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding 5 dummy drivers...");

  for (let i = 1; i <= 5; i++) {
    const user = await prisma.user.create({
      data: {
        email: `driver_dummy_${i}@example.com`,
        phone: `+155500011${i}`,
        firstName: `Dummy${i}`,
        lastName: `Driver`,
        role: "DRIVER",
        status: "ACTIVE",
        driverProfile: {
          create: {
            licenseNumber: `DL-DUMMY-00${i}`,
            licenseExpiresAt: new Date("2030-01-01T00:00:00.000Z"),
          },
        },
      },
    });
    console.log(`Created driver: ${user.email} (User ID: ${user.id})`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
