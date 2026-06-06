import { Request, Response } from "express";
import { getMyProfile, updateMyProfile } from "./profile.service";
import { updateCustomerProfileSchema, updateDriverProfileSchema } from "./profile.validation";

export const handleGetMyProfile = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id, role } = req.user!;

        const profile = await getMyProfile(id, role);

        res.status(200).json({
            success: true,
            data: profile,
        });
    } catch (error: any) {
        res.status(404).json({
            success: false,
            error: {
                code: "PROFILE_NOT_FOUND",
                message: error.message || "Failed to retrieve profile",
            },
        });
    }
};

export const handleUpdateMyProfile = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id, role } = req.user!;

        // Pick the correct schema based on role
        const schema = role === "DRIVER"
            ? updateDriverProfileSchema
            : updateCustomerProfileSchema;

        const validatedData = schema.parse({ body: req.body }).body;

        await updateMyProfile(id, role, validatedData);

        // Re-fetch updated profile to return fresh data
        const updatedProfile = await getMyProfile(id, role);

        res.status(200).json({
            success: true,
            data: updatedProfile,
        });
    } catch (error: any) {
        if (error.name === "ZodError") {
            res.status(400).json({
                success: false,
                error: {
                    code: "VALIDATION_ERROR",
                    message: error.errors[0]?.message || "Validation failed",
                },
            });
            return;
        }

        res.status(400).json({
            success: false,
            error: {
                code: "PROFILE_UPDATE_FAILED",
                message: error.message || "Failed to update profile",
            },
        });
    }
};
