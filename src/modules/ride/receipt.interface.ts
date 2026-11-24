/** The ride + customer fields the HTML receipt template reads. */
export interface ReceiptRideData {
  id: string;
  pickupAddress: string;
  dropoffAddress: string;
  finalFare: { toString(): string } | null;
  distanceKm: number | null;
  durationMinutes: number | null;
  completedAt: Date | null;
  vehicleType: string;
  user: { firstName: string | null; email: string | null };
}
