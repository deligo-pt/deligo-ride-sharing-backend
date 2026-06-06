const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const driver = await prisma.driverProfile.findFirst({
    where: {
      vehicle: null
    }
  });
  
  if (driver) {
    process.stdout.write(`FOUND_DRIVER_ID:${driver.userId}\n`);
  } else {
    process.stdout.write('NO_AVAILABLE_DRIVER\n');
  }
  await prisma.$disconnect();
}

main().catch(e => {
  process.stderr.write(e.message + '\n');
});
