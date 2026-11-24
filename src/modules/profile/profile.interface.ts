export type ProfileData = Record<string, unknown>;

export interface UserWithProfiles {
  id: string;
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  role: string;
  customerProfile?: ProfileData | null;
  driverProfile?: ProfileData | null;
}
