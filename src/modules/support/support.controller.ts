import { SupportService } from './support.service';
import {
  AddTicketMessageDto,
  CreateEmergencyContactDto,
  CreateTicketDto,
  ListTicketsQuery,
  UpdateTicketInput,
} from './support.validation';
import { sendResponse } from '../../utils/sendResponse';
import { catchAsync } from '../../utils/catchAsync';

const addEmergencyContact = catchAsync(async (req, res) => {
  const contact = await SupportService.addEmergencyContact(
    req.user!.id,
    req.body as CreateEmergencyContactDto,
  );
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Emergency contact added successfully',
    data: { contact },
  });
});

const getEmergencyContacts = catchAsync(async (req, res) => {
  const contacts = await SupportService.getEmergencyContacts(req.user!.id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Emergency contacts retrieved successfully',
    data: { contacts, total: contacts.length },
  });
});

const createTicket = catchAsync(async (req, res) => {
  const ticket = await SupportService.createTicket(req.user!.id, req.body as CreateTicketDto);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Support ticket created successfully',
    data: { ticket },
  });
});

const listTickets = catchAsync(async (req, res) => {
  const { tickets, meta } = await SupportService.listTickets(
    { id: req.user!.id, role: req.user!.role },
    req.query as unknown as ListTicketsQuery,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Support tickets retrieved successfully',
    meta,
    data: { tickets, total: meta.total },
  });
});

const addTicketMessage = catchAsync(async (req, res) => {
  const savedMessage = await SupportService.addTicketMessage(
    { id: req.user!.id, role: req.user!.role },
    req.params.id as string,
    req.body as AddTicketMessageDto,
  );

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Ticket message sent successfully',
    data: { message: savedMessage },
  });
});

const updateTicket = catchAsync(async (req, res) => {
  const result = await SupportService.updateTicket(
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

export const SupportController = {
  updateTicket,
  addEmergencyContact,
  getEmergencyContacts,
  createTicket,
  listTickets,
  addTicketMessage,
};
