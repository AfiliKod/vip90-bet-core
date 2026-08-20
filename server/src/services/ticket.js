/**
 * Oyuncu yardım masası / ticket sistemi (D5).
 *
 * İş kuralları:
 * - Operatör yanıtladığında `open` bir tiket otomatik `in_progress`e geçer.
 * - Oyuncu `resolved` bir tikete yazarsa otomatik yeniden `open` olur —
 *   "çözüldü" denip sorunun devam ettiği durumu operatöre geri bildirir.
 * - `closed` bir tikete yazmak status'ü DEĞİŞTİRMEZ — kapanmış bir tiket
 *   sessizce yeniden açılmaz, kapatma kararı ayrı bir işlemdir.
 */
import Ticket from '../models/Ticket.js';

const VALID_STATUSES = ['open', 'in_progress', 'resolved', 'closed'];

export async function createTicket(userId, subject, firstMessage) {
  if (!subject?.trim()) throw new Error('Konu boş olamaz');
  if (!firstMessage?.trim()) throw new Error('İlk mesaj boş olamaz');
  return Ticket.create({
    userId,
    subject: subject.trim(),
    status: 'open',
    messages: [{ senderId: userId, senderRole: 'player', text: firstMessage.trim() }],
  });
}

export async function addMessage(ticketId, senderId, senderRole, text) {
  const ticket = await Ticket.findById(ticketId);
  if (!ticket) throw new Error('Tiket bulunamadı');
  if (!text?.trim()) throw new Error('Mesaj boş olamaz');

  ticket.messages.push({ senderId, senderRole, text: text.trim() });

  if (senderRole === 'admin' && ticket.status === 'open') {
    ticket.status = 'in_progress';
  } else if (senderRole === 'player' && ticket.status === 'resolved') {
    ticket.status = 'open';
  }
  // closed durumunda hiçbir role otomatik geçiş yapmaz.

  await ticket.save();
  return ticket;
}

export async function updateStatus(ticketId, status) {
  if (!VALID_STATUSES.includes(status)) {
    throw new Error(`Geçersiz statü: ${status}`);
  }
  const ticket = await Ticket.findByIdAndUpdate(ticketId, { status }, { new: true });
  if (!ticket) throw new Error('Tiket bulunamadı');
  return ticket;
}

export async function getMyTickets(userId) {
  return Ticket.find({ userId }).sort({ createdAt: -1 });
}

export async function getAllTickets({ status } = {}) {
  const filter = status ? { status } : {};
  return Ticket.find(filter).sort({ createdAt: -1 });
}

export async function getTicketById(ticketId, requestingUserId, isAdmin) {
  const ticket = await Ticket.findById(ticketId);
  if (!ticket) throw new Error('Tiket bulunamadı');
  if (!isAdmin && String(ticket.userId) !== String(requestingUserId)) {
    throw new Error('Bu tikete erişim yetkiniz yok');
  }
  return ticket;
}
