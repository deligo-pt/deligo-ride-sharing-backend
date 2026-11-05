import prisma from './src/config/db';
import { VehicleType } from '@prisma/client';

interface PricingRuleSeed {
  vehicleType: VehicleType;
  baseFare: number;
  perKmRate: number;
  perMinRate: number;
  surgeMultiplier: number;
  adminFeePercentage: number;
}

const defaultPricingRules: PricingRuleSeed[] = [
  {
    vehicleType: VehicleType.Motorcycle,
    baseFare: 30.0,
    perKmRate: 15.0,
    perMinRate: 1.5,
    surgeMultiplier: 1.0,
    adminFeePercentage: 10.0,
  },
  {
    vehicleType: VehicleType.Hatchback,
    baseFare: 50.0,
    perKmRate: 22.0,
    perMinRate: 2.5,
    surgeMultiplier: 1.0,
    adminFeePercentage: 15.0,
  },
  {
    vehicleType: VehicleType.Micro,
    baseFare: 45.0,
    perKmRate: 20.0,
    perMinRate: 2.0,
    surgeMultiplier: 1.0,
    adminFeePercentage: 15.0,
  },
  {
    vehicleType: VehicleType.Sedan,
    baseFare: 60.0,
    perKmRate: 28.0,
    perMinRate: 3.0,
    surgeMultiplier: 1.0,
    adminFeePercentage: 20.0,
  },
  {
    vehicleType: VehicleType.PickupTruck,
    baseFare: 80.0,
    perKmRate: 32.0,
    perMinRate: 3.5,
    surgeMultiplier: 1.0,
    adminFeePercentage: 20.0,
  },
  {
    vehicleType: VehicleType.SUV,
    baseFare: 100.0,
    perKmRate: 40.0,
    perMinRate: 4.5,
    surgeMultiplier: 1.0,
    adminFeePercentage: 20.0,
  },
];

async function seedPricingRules() {
  console.log('⏳ Seeding Pricing Rules into database...');

  for (const rule of defaultPricingRules) {
    await prisma.pricingRule.upsert({
      where: { vehicleType: rule.vehicleType },
      update: {
        baseFare: rule.baseFare,
        perKmRate: rule.perKmRate,
        perMinRate: rule.perMinRate,
        surgeMultiplier: rule.surgeMultiplier,
        adminFeePercentage: rule.adminFeePercentage,
      },
      create: {
        vehicleType: rule.vehicleType,
        baseFare: rule.baseFare,
        perKmRate: rule.perKmRate,
        perMinRate: rule.perMinRate,
        surgeMultiplier: rule.surgeMultiplier,
        adminFeePercentage: rule.adminFeePercentage,
      },
    });
    console.log(` ✅ Seeded pricing rule for: ${rule.vehicleType}`);
  }

  console.log('🚀 All pricing rules successfully seeded!');
}

seedPricingRules()
  .catch((err) => {
    console.error('❌ Failed to seed pricing rules:', err.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
