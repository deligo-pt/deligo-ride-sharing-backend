import prisma from "../../config/db";
import { UpdateCustomerProfileInput, UpdateDriverProfileInput } from "./profile.validation";

type ProfileData = Record<string, unknown>;

interface UserWithProfiles {
    id: string;
    email: string | null;
    phone: string | null;
    firstName: string | null;
    lastName: string | null;
    role: string;
    customerProfile?: ProfileData | null;
    driverProfile?: ProfileData | null;
}

// ─── GET PROFILE ────────────────────────────────────────────────────────────

export const getMyProfile = async (userId: string, userRole: string) => {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            email: true,
            phone: true,
            firstName: true,
            lastName: true,
            role: true,
            customerProfile: userRole === "CUSTOMER" ? {
                select: {
                    totalRides: true,
                    averageRating: true,
                    homeAddress: true,
                    workAddress: true,
                    emergencyContactNumber: true,
                }
            } : false,
            driverProfile: userRole === "DRIVER" ? {
                select: {
                    licenseNumber: true,
                    totalRides: true,
                    averageRating: true,
                    isAvailable: true,
                    currentLatitude: true,
                    currentLongitude: true,
                }
            } : false,
        }
    });

    if (!user) {
        throw new Error("User not found.");
    }

    // The select above only includes the profile relation matching the caller's role.
    const { customerProfile, driverProfile, ...userBase } = user as unknown as UserWithProfiles;

    return {
        ...userBase,
        profile: customerProfile ?? driverProfile ?? null,
    };
};

// ─── UPDATE PROFILE ─────────────────────────────────────────────────────────

export const updateMyProfile = async (
    userId: string,
    userRole: string,
    payload: UpdateCustomerProfileInput | UpdateDriverProfileInput
) => {
    const { firstName, lastName, phone, ...profileFields } = payload as UpdateCustomerProfileInput &
        UpdateDriverProfileInput;

    // Update base User fields if provided
    const userUpdateData: Record<string, string> = {};
    if (firstName) userUpdateData.firstName = firstName;
    if (lastName) userUpdateData.lastName = lastName;
    if (phone) userUpdateData.phone = phone;

    if (userRole === "CUSTOMER") {
        const { emergencyContactNumber, homeAddress, workAddress } = profileFields;

        const [updatedUser] = await prisma.$transaction([
            ...(Object.keys(userUpdateData).length > 0
                ? [prisma.user.update({ where: { id: userId }, data: userUpdateData })]
                : []),
            prisma.customerProfile.update({
                where: { userId },
                data: { emergencyContactNumber, homeAddress, workAddress },
            }),
        ]);

        return updatedUser;
    }

    if (userRole === "DRIVER") {
        const { isAvailable, currentLatitude, currentLongitude } = profileFields;

        const [updatedUser] = await prisma.$transaction([
            ...(Object.keys(userUpdateData).length > 0
                ? [prisma.user.update({ where: { id: userId }, data: userUpdateData })]
                : []),
            prisma.driverProfile.update({
                where: { userId },
                data: { isAvailable, currentLatitude, currentLongitude },
            }),
        ]);

        return updatedUser;
    }

    throw new Error("Profile update is not supported for this role.");
};
