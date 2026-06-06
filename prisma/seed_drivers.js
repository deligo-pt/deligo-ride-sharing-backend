require("dotenv/config");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is missing");

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding 5 dummy drivers...");

  for (let i = 1; i <= 5; i++) {
    // Generate some random URLs for the documents
    const dummyUrl = `https://res.cloudinary.com/demo/image/upload/sample_doc_${i}.jpg`;
    
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
            document: {
              create: {
                drivingLicenseUrl: dummyUrl,
                nationalIdUrl: dummyUrl,
                vehicleRegistrationUrl: dummyUrl,
                vehicleInsuranceUrl: dummyUrl,
                driverSelfieUrl: dummyUrl,
                proofOfAddressUrl: dummyUrl,
                taxIdUrl: dummyUrl,
                verificationStatus: "PENDING",
              }
            }
          },
        },
      },
      include: {
        driverProfile: {
          include: {
            document: true
          }
        }
      }
    });
    console.log(`Created driver: ${user.email} with full document set`);
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
