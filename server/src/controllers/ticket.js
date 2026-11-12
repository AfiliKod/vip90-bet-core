import Ticket from '../models/Ticket.js';
import { createError } from '../middleware/error.js';
import {
  createTicket, addMessage, updateStatus, getMyTickets, getAllTickets,
  getTicketById as getTicketByIdService,
} from '../services/ticket.js';

// Cross-tenant :id lookups answer 404 (spec §9 G-3); existence is never disclosed.
async function assertTicketInTenant(ticketId, tenantId) {
  if (!tenantId) return;
  const owned = await Ticket.exists({ _id: ticketId, tenantId });
  if (!owned) throw createError(404, 'NOT_FOUND', 'Tiket bulunamadı');
}

// ─── Oyuncu uçları ──────────────────────────────────────────────────────────

export async function createMyTicket(req, res, next) {
  try {
    const { subject, message } = req.validated;
    const ticket = await createTicket(req.user.id, subject, message);
    res.status(201).json(ticket);
  } catch (e) { next(createError(400, 'INVALID_TICKET', e.message)); }
}

export async function listMyTickets(req, res, next) {
  try {
    res.json(await getMyTickets(req.user.id));
  } catch (e) { next(e); }
}

export async function getMyTicket(req, res, next) {
  try {
    const ticket = await getTicketByIdService(req.params.id, req.user.id, false);
    res.json(ticket);
  } catch (e) { next(createError(404, 'NOT_FOUND', e.message)); }
}

export async function replyToMyTicket(req, res, next) {
  try {
    const { message } = req.validated;
    // Sahiplik kontrolü: kendi tiketi olmayana yazamaz.
    await getTicketByIdService(req.params.id, req.user.id, false);
    const ticket = await addMessage(req.params.id, req.user.id, 'player', message);
    res.json(ticket);
  } catch (e) { next(createError(404, 'NOT_FOUND', e.message)); }
}

// ─── Admin uçları ───────────────────────────────────────────────────────────

export async function listAllTickets(req, res, next) {
  try {
    res.json(await getAllTickets({ status: req.query.status }));
  } catch (e) { next(e); }
}

export async function getTicketById(req, res, next) {
  try {
    await assertTicketInTenant(req.params.id, req.tenant?.id);
    res.json(await getTicketByIdService(req.params.id, req.user.id, true));
  } catch (e) { next(createError(404, 'NOT_FOUND', e.message)); }
}

export async function getAnyTicket(req, res, next) {
  return getTicketById(req, res, next);
}

export async function replyAsAdmin(req, res, next) {
  try {
    await assertTicketInTenant(req.params.id, req.tenant?.id);
    const { message } = req.validated;
    const ticket = await addMessage(req.params.id, req.user.id, 'admin', message);
    res.json(ticket);
  } catch (e) { next(createError(404, 'NOT_FOUND', e.message)); }
}

export async function setTicketStatus(req, res, next) {
  try {
    await assertTicketInTenant(req.params.id, req.tenant?.id);
  } catch (e) { return next(e); }
  try {
    const { status } = req.validated;
    const ticket = await updateStatus(req.params.id, status);
    res.json(ticket);
  } catch (e) { next(createError(400, 'INVALID_STATUS', e.message)); }
}
