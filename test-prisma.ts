import prisma from './src/config/db';

async function main() {
  try {
    const customer = await prisma.customerProfile.findFirst();
    if (!customer) {
      console.log('No customer');
      return;
    }
    await prisma.ride.create({
      data: {
        customerId: customer.id,
        pickupAddress: 'Gulshan-1, Dhaka',
        pickupLatitude: 23.8103,
        pickupLongitude: 90.4125,
        dropoffAddress: 'Dhanmondi-27, Dhaka',
        dropoffLatitude: 23.7461,
        dropoffLongitude: 90.3742,
        vehicleType: 'Sedan',
        estimatedFare: 10.37,
        estimatedDistance: 9.83,
        estimatedDuration: 28,
        status: 'REQUESTED',
      },
    });
    console.log('Success');
  } catch (e: any) {
    console.error(e.message);
  }
}
main();
