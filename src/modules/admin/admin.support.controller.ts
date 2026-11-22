import { Request, Response, NextFunction } from 'express';
import { sendResponse } from '../../utils/sendResponse';
import { assertAdmin } from './admin.util';
import { listSupportTickets, updateSupportTicket, addTicketMessage } from './admin.support.service';

export const getTicketsHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    assertAdmin(req);
    const { tickets, meta } = await listSupportTickets(req.query as never);
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Support tickets retrieved successfully',
      meta,
      data: { tickets },
    });
  } catch (err) {
    next(err);
  }
};

export const updateTicketHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    assertAdmin(req);
    const adminId = req.user!.id;
    const ticketId = req.params.id as string;
    const result = await updateSupportTicket(
      ticketId,
      adminId,
      req.body as Parameters<typeof updateSupportTicket>[2],
    );
    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: 'Support ticket updated successfully',
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

export const addTicketMessageHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    assertAdmin(req);
    const adminId = req.user!.id;
    const ticketId = req.params.id as string;
    const result = await addTicketMessage(
      ticketId,
      adminId,
      req.body as Parameters<typeof addTicketMessage>[2],
    );
    sendResponse(res, {
      statusCode: 201,
      success: true,
      message: 'Ticket message added successfully',
      data: result,
    });
  } catch (err) {
    next(err);
  }
};
