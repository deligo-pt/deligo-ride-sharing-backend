import { sendResponse } from '../../utils/sendResponse';
import { catchAsync } from '../../utils/catchAsync';
import { AdminSupportService } from './admin-support.service';
import {
  AddTicketMessageInput,
  ListTicketsQuery,
  UpdateTicketInput,
} from './admin-support.validation';

/** GET /api/v1/admin/support/tickets */
const getTickets = catchAsync(async (req, res) => {
  const { tickets, meta } = await AdminSupportService.listSupportTickets(
    req.query as unknown as ListTicketsQuery,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Support tickets retrieved successfully',
    meta,
    data: { tickets },
  });
});

/** PATCH /api/v1/admin/support/tickets/:id */
const updateTicket = catchAsync(async (req, res) => {
  const result = await AdminSupportService.updateSupportTicket(
    req.params.id as string,
    req.user!.id,
    req.body as UpdateTicketInput,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Support ticket updated successfully',
    data: result,
  });
});

/** POST /api/v1/admin/support/tickets/:id/messages */
const addTicketMessage = catchAsync(async (req, res) => {
  const result = await AdminSupportService.addTicketMessage(
    req.params.id as string,
    req.user!.id,
    req.body as AddTicketMessageInput,
  );
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Ticket message added successfully',
    data: result,
  });
});

export const AdminSupportController = {
  getTickets,
  updateTicket,
  addTicketMessage,
};
