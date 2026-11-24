/** A single zone surcharge applied to this fare. */
export interface ZoneSurcharge {
  zoneId: string;
  zoneName: string;
  amount: number;
}

export interface FareBreakdown {
  vehicleType: string;
  vehicleClass: string;
  // Inputs
  distanceKm: number;
  estimatedDurationMinutes: number;
  surgeMultiplier: number;
  // Line items
  baseFare: number;
  distanceFare: number;
  timeFare: number;
  subtotal: number; // base + distance + time (before surge)
  surgeAmount: number; // subtotal * (surge - 1)
  serviceFee: number;
  taxAmount: number;
  // Zone surcharges (e.g. airport fees)
  zoneSurcharges: ZoneSurcharge[];
  zoneSurchargeTotal: number;
  // Promo
  promoCode: string | null;
  discountAmount: number;
  // Final
  grandTotal: number;
}
