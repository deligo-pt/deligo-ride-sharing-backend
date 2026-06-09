import { Request, Response, NextFunction } from 'express';
import { successResponse } from '../../types/api.types';
import { assertAdmin } from './admin.utils';
import {
  listSupportTickets,
  updateSupportTicket,
  addTicketMessage,
} from './admin.support.service';

export const getTicketsHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    assertAdmin(req);
    const { tickets, meta } = await listSupportTickets(req.query as never);
    res.status(200).json(successResponse({ tickets }, meta));
  } catch (err) {
    next(err);
  }
};

export const updateTicketHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    assertAdmin(req);
    const adminId = req.user!.id;
    const ticketId = req.params.id as string;
    const result = await updateSupportTicket(ticketId, adminId, req.body);
    res.status(200).json(successResponse(result));
  } catch (err) {
    next(err);
  }
};

export const addTicketMessageHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    assertAdmin(req);
    const adminId = req.user!.id;
    const ticketId = req.params.id as string;
    const result = await addTicketMessage(ticketId, adminId, req.body);
    res.status(201).json(successResponse(result));
  } catch (err) {
    next(err);
  }
};
