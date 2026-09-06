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
import User from '../models/User.js';
import { getIO } from './socketEmitter.js';
import { sendEmail } from './email.js';
import { getSiteName } from '../branding/index.js';

const VALID_STATUSES = ['open', 'in_progress', 'resolved', 'closed'];

export async function createTicket(userId, subject, firstMessage) {
  if (!subject?.trim()) throw new Error('Konu boş olamaz');
  if (!firstMessage?.trim()) throw new Error('İlk mesaj boş olamaz');
  const ticket = await Ticket.create({
    userId,
    subject: subject.trim(),
    status: 'open',
    messages: [{ senderId: userId, senderRole: 'player', text: firstMessage.trim() }],
  });

  const io = getIO();
  if (io) io.to('role:admin').emit('ticket:new', { ticketId: ticket._id, subject: ticket.subject, userId });

  return ticket;
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

  if (senderRole === 'admin') {
    const io = getIO();
    if (io) io.to(`user:${ticket.userId}`).emit('ticket:reply', { ticketId: ticket._id });

    const user = await User.findById(ticket.userId).select('username email');
    if (user?.email) {
      const siteName = await getSiteName();
      await sendEmail({
        to: user.email,
        subject: `Destek talebinize yanıt geldi: ${ticket.subject}`,
        html: `
          <h2>Destek Talebinize Yanıt Geldi</h2>
          <p>Sayın ${user.username},</p>
          <p><strong>${ticket.subject}</strong> konulu destek talebinize yeni bir yanıt eklendi.</p>
          <p>Yanıtı görüntülemek için Yardım Merkezi'ne giriş yapabilirsiniz.</p>
          <p>İyi eğlenceler,<br>${siteName} Ekibi</p>
        `,
      });
    }
  }

  return ticket;
}

export async function updateStatus(ticketId, status) {
  if (!VALID_STATUSES.includes(status)) {
    throw new Error(`Geçersiz statü: ${status}`);
  }
  const ticket = await Ticket.findByIdAndUpdate(ticketId, { status }, { new: true });
  if (!ticket) throw new Error('Tiket bulunamadı');

  const io = getIO();
  if (io) io.to(`user:${ticket.userId}`).emit('ticket:status', { ticketId: ticket._id, status });

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
