import prisma from "../../config/db";
import { CreateVehicleInput, UpdateVehicleInput } from "./vehicle.validation";

export const createVehicle = async (userId: string, payload: CreateVehicleInput) => {
    // Check if the user has a driver profile
    const driverProfile = await prisma.driverProfile.findUnique({
        where: { userId }
    });

    if (!driverProfile) {
        throw new Error("Driver profile not found. You must be a registered driver to add a vehicle.");
    }

    // Check if a vehicle already exists for this driver profile
    const existingVehicle = await prisma.vehicle.findUnique({
        where: { driverProfileId: driverProfile.id }
    });

    if (existingVehicle) {
        throw new Error("A vehicle is already registered for this driver.");
    }

    // Check if license plate is already in use
    const existingPlate = await prisma.vehicle.findUnique({
        where: { licensePlate: payload.licensePlate }
    });

    if (existingPlate) {
        throw new Error("License plate is already in use.");
    }

    const newVehicle = await prisma.vehicle.create({
        data: {
            ...payload,
            driverProfileId: driverProfile.id,
        }
    });

    return newVehicle;
};

export const getVehicles = async (userId: string, userRole: string) => {
    if (userRole === 'ADMIN') {
        return await prisma.vehicle.findMany();
    }

    if (userRole === 'DRIVER') {
        const driverProfile = await prisma.driverProfile.findUnique({
            where: { userId }
        });

        if (!driverProfile) {
            throw new Error("Driver profile not found.");
        }

        return await prisma.vehicle.findMany({
            where: { driverProfileId: driverProfile.id }
        });
    }

    throw new Error("You are not authorized to view vehicles.");
};

export const updateVehicle = async (vehicleId: string, userId: string, userRole: string, payload: UpdateVehicleInput) => {
    if (userRole !== 'DRIVER') {
        throw new Error("Only drivers can update their vehicles.");
    }

    const driverProfile = await prisma.driverProfile.findUnique({
        where: { userId }
    });

    if (!driverProfile) {
        throw new Error("Driver profile not found.");
    }

    const existingVehicle = await prisma.vehicle.findUnique({
        where: { id: vehicleId }
    });

    if (!existingVehicle) {
        throw new Error("Vehicle not found.");
    }

    if (existingVehicle.driverProfileId !== driverProfile.id) {
        throw new Error("You are not authorized to update this vehicle.");
    }

    if (payload.licensePlate) {
        const plateExists = await prisma.vehicle.findUnique({
            where: { licensePlate: payload.licensePlate }
        });
        if (plateExists && plateExists.id !== vehicleId) {
            throw new Error("License plate is already in use.");
        }
    }

    return await prisma.vehicle.update({
        where: { id: vehicleId },
        data: payload
    });
};

export const deleteVehicle = async (vehicleId: string, userId: string, userRole: string) => {
    const existingVehicle = await prisma.vehicle.findUnique({
        where: { id: vehicleId }
    });

    if (!existingVehicle) {
        throw new Error("Vehicle not found.");
    }

    if (userRole === 'DRIVER') {
        const driverProfile = await prisma.driverProfile.findUnique({
            where: { userId }
        });

        if (!driverProfile || existingVehicle.driverProfileId !== driverProfile.id) {
            throw new Error("You are not authorized to delete this vehicle.");
        }
    } else if (userRole !== 'ADMIN') {
        throw new Error("You are not authorized to delete vehicles.");
    }

    return await prisma.vehicle.delete({
        where: { id: vehicleId }
    });
};