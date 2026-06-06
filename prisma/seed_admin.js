require("dotenv/config");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is missing");

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding a dummy user (customer) and an admin profile...");

  // 1. Create a dummy Customer User
  const customer = await prisma.user.create({
    data: {
      email: "customer_dummy@example.com",
      phone: "+1555111222",
      firstName: "John",
      lastName: "Doe",
      role: "CUSTOMER",
      status: "ACTIVE",
      customerProfile: {
        create: {
          homeAddress: "123 Main St, Springfield",
          workAddress: "456 Corporate Blvd, Springfield",
          emergencyContactNumber: "+1555999888",
        },
      },
    },
    include: {
      customerProfile: true,
    },
  });
  console.log(`Created customer: ${customer.email} (User ID: ${customer.id})`);

  // 2. Create a dummy Admin User
  const admin = await prisma.user.create({
    data: {
      email: "admin_dummy@example.com",
      phone: "+1555333444",
      firstName: "Admin",
      lastName: "User",
      role: "ADMIN",
      status: "ACTIVE",
      adminProfile: {
        create: {
          accessLabel: "SUPER_ADMIN",
          assignedRegion: "Global",
        },
      },
    },
    include: {
      adminProfile: true,
    },
  });
  console.log(`Created admin: ${admin.email} (User ID: ${admin.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
