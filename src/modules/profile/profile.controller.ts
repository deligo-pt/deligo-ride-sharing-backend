import { NextFunction, Request, Response } from "express";
import { getMyProfile, updateMyProfile } from "./profile.service";
import { updateCustomerProfileSchema, updateDriverProfileSchema } from "./profile.validation";
import { sendResponse } from "../../utils/sendResponse";
import { toAppError } from "../../utils/errors";

export const handleGetMyProfile = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const { id, role } = req.user!;

        const profile = await getMyProfile(id, role);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: 'Profile retrieved successfully',
            data: profile,
        });
    } catch (error: unknown) {
        next(
            toAppError(error, {
                statusCode: 404,
                code: "PROFILE_NOT_FOUND",
                message: "Failed to retrieve profile",
            }),
        );
    }
};

export const handleUpdateMyProfile = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const { id, role } = req.user!;

        // Pick the correct schema based on role
        const schema = role === "DRIVER"
            ? updateDriverProfileSchema
            : updateCustomerProfileSchema;

        const validatedData = schema.parse({ body: req.body as unknown }).body;

        await updateMyProfile(id, role, validatedData);

        // Re-fetch updated profile to return fresh data
        const updatedProfile = await getMyProfile(id, role);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: 'Profile updated successfully',
            data: updatedProfile,
        });
    } catch (error: unknown) {
        next(
            toAppError(error, {
                statusCode: 400,
                code: "PROFILE_UPDATE_FAILED",
                message: "Failed to update profile",
            }),
        );
    }
};
