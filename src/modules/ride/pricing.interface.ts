export interface ZoneSurcharge {
  zoneId: string;
  zoneName: string;
  amount: number;
}

export interface FareBreakdown {
  vehicleType: string;
  vehicleClass: string;
  distanceKm: number;
  estimatedDurationMinutes: number;
  surgeMultiplier: number;
  baseFare: number;
  distanceFare: number;
  timeFare: number;
  subtotal: number;
  surgeAmount: number;
  serviceFee: number;
  taxAmount: number;
  zoneSurcharges: ZoneSurcharge[];
  zoneSurchargeTotal: number;
  promoCode: string | null;
  discountAmount: number;
  grandTotal: number;
}
