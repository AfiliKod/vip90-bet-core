import { createError } from '../middleware/error.js';
import {
  createTicket, addMessage, updateStatus, getMyTickets, getAllTickets, getTicketById,
} from '../services/ticket.js';

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
    const ticket = await getTicketById(req.params.id, req.user.id, false);
    res.json(ticket);
  } catch (e) { next(createError(404, 'NOT_FOUND', e.message)); }
}

export async function replyToMyTicket(req, res, next) {
  try {
    const { message } = req.validated;
    // Sahiplik kontrolü: kendi tiketi olmayana yazamaz.
    await getTicketById(req.params.id, req.user.id, false);
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

export async function getAnyTicket(req, res, next) {
  try {
    res.json(await getTicketById(req.params.id, req.user.id, true));
  } catch (e) { next(createError(404, 'NOT_FOUND', e.message)); }
}

export async function replyAsAdmin(req, res, next) {
  try {
    const { message } = req.validated;
    const ticket = await addMessage(req.params.id, req.user.id, 'admin', message);
    res.json(ticket);
  } catch (e) { next(createError(404, 'NOT_FOUND', e.message)); }
}

export async function setTicketStatus(req, res, next) {
  try {
    const { status } = req.validated;
    const ticket = await updateStatus(req.params.id, status);
    res.json(ticket);
  } catch (e) { next(createError(400, 'INVALID_STATUS', e.message)); }
}
