/**
 * Slikair Payment Gateway Controller
 *
 * Handles deposit initiation, webhook notifications, and admin queries.
 */
import { randomUUID as uuidv4 } from 'node:crypto';
import mongoose from 'mongoose';
import { withTransactionRetry } from '../utils/transactionRetry.js';
import { createError } from '../middleware/error.js';
import User from '../models/User.js';
import SlikairPayment from '../models/SlikairPayment.js';
import SlikairPayout from '../models/SlikairPayout.js';
import * as slikairService from '../services/slikairService.js';
import { createTransaction, emitDepositRisk } from '../services/ledger.js';
import { updateDailyStats, checkPlayerEligibility } from '../services/responsibleGaming.js';
import { isSlikairConfigured } from '../config/slikairConfig.js';
import { errorLogger } from '../services/errorLogger.js';

// Testlerin getPaymentStatus/getPayoutStatus'u (gerçek sandbox ağ isteği
// yapmadan) taklit edebilmesi için — igamesSession.js'teki _setIgamesService
// deseniyle tutarlı.
let _slikairService = slikairService;
export function _setSlikairService(svc) { _slikairService = svc; }
export function _getSlikairService() { return _slikairService; }

// ── Kullanıcı: Yatırma Başlat ──────────────────────────────────────────────

export async function initiateDeposit(req, res, next) {
  try {
    if (!(await isSlikairConfigured())) {
      throw createError(503, 'SLIKAIR_DISABLED', 'Slikair ödeme sistemi şu an aktif değil');
    }

    const { checkPlayerEligibility: check } = await import('../services/responsibleGaming.js');
    const eligibility = await check(req.user.id, 'deposit', { amount: req.validated.amount });
    if (eligibility === 'BLOCK') {
      throw createError(403, 'ACCOUNT_RESTRICTED', 'Hesabınız sorumlu oyun nedeniyle kısıtlıdır');
    }
    if (eligibility === 'RESTRICT') {
      throw createError(403, 'LIMIT_EXCEEDED', 'Yatırma limitinizi aşmış bulunuyorsunuz');
    }

    const requestId = uuidv4();
    const user = await User.findById(req.user.id);
    if (!user) throw createError(404, 'NOT_FOUND', 'Kullanıcı bulunamadı');

    // Slikair'e istek gönder
    const result = await slikairService.createPayment({
      amount: req.validated.amount,
      currency: req.validated.currency,
      paymentMethod: req.validated.paymentMethod,
      email: req.validated.email,
      country: req.validated.country,
      firstName: req.validated.firstName,
      lastName: req.validated.lastName,
      cardNum: req.validated.cardNum,
      cardHolder: req.validated.cardHolder,
      cardExpireMonth: req.validated.cardExpireMonth,
      cardExpireYear: req.validated.cardExpireYear,
      cardCvv: req.validated.cardCvv,
      mobile: req.validated.mobile,
      address: req.validated.address,
      city: req.validated.city,
      zipCode: req.validated.zipCode,
      state: req.validated.state,
      birthDate: req.validated.birthDate,
      deviceIp: req.ip,
    }, { idempotencyKey: requestId });

    // Veritabanına kaydet
    const payment = await SlikairPayment.create({
      userId: user._id,
      requestId,
      payinId: result.payin_id || null,
      amount: req.validated.amount,
      currency: req.validated.currency,
      paymentMethod: req.validated.paymentMethod,
      email: req.validated.email,
      country: req.validated.country,
      status: result.status === 'success' ? 'pending' : 'failed',
      statusCode: result.status_code || null,
      redirectUrl: result.redirect_url || null,
      metadata: { samaAgentResponse: result },
    });

    res.status(201).json({
      paymentId: payment._id,
      payinId: result.payin_id,
      redirectUrl: result.redirect_url,
      status: payment.status,
    });
  } catch (e) { next(e); }
}

// ── Admin: Payout (Çekim) Başlat ────────────────────────────────────────────
// Kullanıcı tarafında Slikair çekimi isteyecek bir arayüz/akış henüz yok
// (bank/crypto'daki gibi bir talep-onay modeli kurulmadı) — bu, admin'in bir
// kullanıcı için doğrudan payout başlatabildiği minimal bir endpoint. Bakiye
// düşümü admin_adjustment değil gerçek bir withdraw hareketi olarak
// işleniyor ki işlem geçmişinde doğru görünsün. NOT: Slikair'in kendi OpenAPI
// spec'i "Sandbox environment does not support payouts" diyor — bu yüzden
// sandbox'ta bu endpoint muhtemelen Slikair'den bir hata/red alacak, gerçek
// bir "succeeded" webhook'u sandbox'ta hiç gelmeyecek.
export async function initiatePayout(req, res, next) {
  try {
    if (!(await isSlikairConfigured())) {
      throw createError(503, 'SLIKAIR_DISABLED', 'Slikair ödeme sistemi şu an aktif değil');
    }

    const { userId, amount, currency, method, country, paymentDetails } = req.validated;
    const user = await User.findById(userId);
    if (!user) throw createError(404, 'NOT_FOUND', 'Kullanıcı bulunamadı');
    if (user.balance < amount) throw createError(400, 'INSUFFICIENT_BALANCE', 'Kullanıcının bakiyesi yetersiz');

    const merchantReference = uuidv4();
    let payout;

    // 1) Bakiyeyi düş + kayıtları oluştur (Slikair'e hiç istek atmadan önce —
    //    crypto.js withdraw-request'teki "önce düş, hata olursa iade et"
    //    deseniyle tutarlı).
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const fresh = await User.findById(userId).session(session);
      if (fresh.balance < amount) throw createError(400, 'INSUFFICIENT_BALANCE', 'Kullanıcının bakiyesi yetersiz');
      const balanceBefore = fresh.balance;
      fresh.balance = +(fresh.balance - amount).toFixed(2);
      await fresh.save({ session });

      [payout] = await SlikairPayout.create([{
        userId: fresh._id,
        merchantReference,
        amount,
        currency,
        method,
        customer: { firstName: fresh.username, email: fresh.email, phone: fresh.phone || undefined },
        paymentDetails,
        status: 'created',
      }], { session });

      await createTransaction({
        userId: fresh._id,
        type: 'withdraw',
        amount: -amount,
        balanceBefore,
        balanceAfter: fresh.balance,
        referenceId: payout._id,
        status: 'pending',
        note: `Slikair çekim (admin başlatıldı, ${method})`,
        idempotencyKey: `slikair_payout_${merchantReference}`,
        source: 'admin',
        createdBy: req.user.id,
      }, { session });

      await session.commitTransaction();
    } catch (e) {
      await session.abortTransaction();
      throw e;
    } finally {
      session.endSession();
    }

    // 2) Slikair'e istek gönder. Başarısız olursa bakiyeyi iade et.
    try {
      const result = await _slikairService.createPayout({
        amount,
        currency,
        method,
        country,
        merchantReference,
        notificationUrl: undefined,
        customer: payout.customer,
        paymentDetails,
      });

      payout.payoutId = result.payout_id || result.payoutId || null;
      payout.status = 'processing';
      await payout.save();

      res.status(201).json({
        payoutId: payout._id,
        slikairPayoutId: payout.payoutId,
        status: payout.status,
        slikairResponse: result,
      });
    } catch (e) {
      payout.status = 'failed';
      await payout.save();
      const balanceBeforeRefund = (await User.findById(userId)).balance;
      const refunded = await User.findByIdAndUpdate(
        userId,
        { $inc: { balance: amount } },
        { new: true },
      );
      await createTransaction({
        userId,
        type: 'refund',
        amount,
        balanceBefore: balanceBeforeRefund,
        balanceAfter: refunded.balance,
        referenceId: payout._id,
        status: 'completed',
        note: `Slikair çekim başlatılamadı, bakiye iade edildi: ${e.message}`,
        idempotencyKey: `slikair_payout_refund_${merchantReference}`,
        source: 'system',
      }).catch(() => {});
      throw e;
    }
  } catch (e) { next(e); }
}

// ── Webhook: Payin Notification ─────────────────────────────────────────────

export async function handlePayinWebhook(req, res, next) {
  try {
    const { status, status_code, payin_id, merchant_reference, payment_method,
      amount, currency, reason_code, decline_reason } = req.body;

    if (!payin_id) {
      return res.status(400).json({ error: 'Missing payin_id' });
    }

    // Kaydı bul — Slikair API'si payin_id döndürür, modelde payinId olarak saklanır
    const payment = await SlikairPayment.findOne({ payinId: payin_id });
    if (!payment) {
      // Bilinmeyen payin_id — log'la ama 200 dön (tekrar deneme döngüsüne girmemesi için)
      console.warn(`[Slikair] Webhook for unknown payin_id: ${payin_id}`);
      return res.status(200).json({ ok: true });
    }

    // Idempotency: zaten succeeded ise tekrar kredi yapma
    if (payment.status === 'succeeded') {
      return res.status(200).json({ ok: true, message: 'Already processed' });
    }

    // Durum haritası
    const statusMap = {
      100: 'pending',      // Created
      200: 'processing',   // Processing
      201: 'succeeded',    // Authorized
      300: 'pending',      // 3DS redirect gerekli
      301: 'failed',       // Declined
      302: 'failed',       // Expired
      303: 'failed',       // Failed
      310: 'succeeded',    // Captured (son durum)
      311: 'failed',       // Capture failed
      317: 'failed',       // Invalid CVV
      318: 'failed',       // Expired card
      320: 'refunded',     // Refunded
      330: 'failed',       // Risk decline
    };

    // 2026-09-22'de canlı sandbox testinde bulundu: bir "auto" akışlı
    // credit_card test kartı (1111111111111111) webhook'u status_code=200
    // ile geldi — statusMap bunu (yanlış şekilde) "processing" (ara durum)
    // sanıyordu, halbuki AYNI payin_id için get-status status_code=200'ü
    // "succeeded" olarak raporluyor (Slikair'in status_code semantiği
    // status'e (string) bağlı olarak değişiyor, sabit bir final/ara-durum
    // haritası değil). Sonuç: newStatus hiç 'succeeded' olmadığı için
    // aşağıdaki get-status çapraz doğrulaması TETİKLENMİYORDU, ödeme
    // sonsuza kadar 'processing'de takılı kalıyordu — kredi asla verilmedi.
    // Düzeltme: webhook'un kendi "status" (string) alanı "succeeded"
    // diyorsa statusMap'e bakmadan önceliklendiriyoruz. Bu güvenliği
    // ZAYIFLATMAZ — webhook imzasız olduğu için "succeeded" iddiasına
    // zaten hiçbir zaman doğrudan güvenilmiyor, bu sadece get-status
    // çapraz doğrulamasının ÇALIŞIP ÇALIŞMAYACAĞINI belirliyor; daha sık
    // doğrulama yapmak asla daha az güvenli olamaz.
    const newStatus = status === 'succeeded' ? 'succeeded' : (statusMap[status_code] || payment.status);

    // GÜVENLİK: Slikair'in webhook'ları (DMN) imzasız — OpenAPI spec'i webhook
    // endpoint'i için açıkça `security: []` belirtiyor, HMAC/imza header'ı da
    // dokümante edilmiş değil (doc.slikair.com'da da bu konuda bir mekanizma yok,
    // teyit edildi). Bu yüzden webhook body'sindeki "succeeded" durumuna körü
    // körüne güvenip kredi vermek, geçerli bir payin_id'yi bilen HERKESİN (ör.
    // kendi meşru bir yatırma denemesinden dönen payin_id ile) sahte bir webhook
    // POST ederek gerçekte ödeme yapmadan bakiyesine kredi kazanmasına izin verir.
    // Krediye geçmeden önce Slikair'in KENDİ /payment/get-status API'sine (merchant
    // kimlik bilgileriyle korunan, sahte bir webhook'un taklit edemeyeceği bir
    // sunucu-sunucu çağrısı) çapraz doğrulama yapıyoruz — hem durum hem tutar/para
    // birimi eşleşmeli.
    let verifiedSucceeded = false;
    if (newStatus === 'succeeded' && payment.status !== 'succeeded') {
      try {
        const statusCheck = await _slikairService.getPaymentStatus(payin_id);
        verifiedSucceeded = statusCheck?.status === 'succeeded'
          && Number(statusCheck?.amount) === Number(payment.amount)
          && statusCheck?.currency === payment.currency;
        if (!verifiedSucceeded) {
          errorLogger.critical(
            'slikair_webhook_verification_failed',
            `payin_id=${payin_id} webhook'u "succeeded" dedi ama get-status çapraz doğrulaması eşleşmedi — kredi VERİLMEDİ`,
            { payinId: payin_id, webhookBody: req.body, statusCheck, storedAmount: payment.amount, storedCurrency: payment.currency },
          );
        }
      } catch (e) {
        errorLogger.critical(
          'slikair_webhook_verification_error',
          `payin_id=${payin_id} için get-status çapraz doğrulaması başarısız oldu — kredi VERİLMEDİ: ${e.message}`,
          { payinId: payin_id },
        );
      }
    }

    // MongoDB transaction ile bakiye güncelleme
    if (newStatus === 'succeeded' && payment.status !== 'succeeded' && verifiedSucceeded) {
      const session = await mongoose.startSession();
      try {
        await withTransactionRetry(session, async () => {
          const user = await User.findById(payment.userId).session(session);
          if (!user) throw new Error('User not found');

          const balanceBefore = user.balance;
          const balanceAfter = parseFloat((user.balance + payment.amount).toFixed(2));

          user.balance = balanceAfter;
          await user.save({ session });

          await createTransaction({
            userId: user._id,
            type: 'deposit',
            amount: payment.amount,
            balanceBefore,
            balanceAfter,
            referenceId: payment._id,
            status: 'completed',
            note: `Slikair yatırma (${payment.paymentMethod})`,
            idempotencyKey: `slikair_payin_${payment.payinId}`,
            source: 'system',
            metadata: { payinId: payment.payinId, paymentMethod: payment.paymentMethod },
          }, { session });

          payment.status = 'succeeded';
          payment.creditedAt = new Date();
          await payment.save({ session });
        });

        // Transaction SONRASI — retry bloğunun dışında
        updateDailyStats(payment.userId, 'deposit', payment.amount).catch((e) => {
          console.error(`[RG] updateDailyStats (deposit) failed for payin ${payment.payinId}:`, e.message);
        });
        emitDepositRisk(payment.userId, payment.amount, { payinId: payment.payinId }).catch(() => {});
      } finally {
        await session.endSession();
      }
    } else if (newStatus === 'succeeded' && payment.status !== 'succeeded') {
      // get-status çapraz doğrulaması başarısız oldu — 'succeeded' YAZILMAZ (aksi
      // halde en üstteki idempotency kontrolü sonraki gerçek/doğrulanmış webhook'u da
      // sessizce yok sayardı). 'processing'de bırakılıp admin incelemesi için
      // metadata'ya işleniyor; krediye geçilmiyor.
      payment.status = 'processing';
      payment.statusCode = status_code;
      payment.metadata = {
        ...(payment.metadata || {}),
        unverifiedSucceededWebhook: { status, status_code, amount, currency, receivedAt: new Date() },
      };
      payment.webhookReceivedAt = new Date();
      await payment.save();
    } else {
      // Succeeded değilse (failed/refunded/pending/processing vb.) sadece durumu güncelle
      payment.status = newStatus;
      payment.statusCode = status_code;
      payment.reasonCode = reason_code || null;
      payment.declineReason = decline_reason || null;
      payment.webhookReceivedAt = new Date();
      await payment.save();
    }

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[Slikair] Payin webhook error:', e);
    // Hata olsa bile 200 dön — Slikair tekrar denemesin
    res.status(200).json({ ok: true });
  }
}

// ── Webhook: Payout Notification ────────────────────────────────────────────

export async function handlePayoutWebhook(req, res, next) {
  try {
    const { status, payoutId, merchantReference, amount, currency, statusCode, reasonCode } = req.body;

    if (!payoutId) {
      return res.status(400).json({ error: 'Missing payoutId' });
    }

    const payout = await SlikairPayout.findOne({ payoutId });
    if (!payout) {
      console.warn(`[Slikair] Webhook for unknown payout_id: ${payoutId}`);
      return res.status(200).json({ ok: true });
    }

    // Idempotency
    if (payout.status === 'succeeded') {
      return res.status(200).json({ ok: true, message: 'Already processed' });
    }

    const statusMap = {
      100: 'created',
      200: 'processing',
      310: 'succeeded',
      311: 'failed',
      320: 'failed',
      330: 'failed',
    };

    // handlePayinWebhook'taki 2026-09-22 canlı test bulgusuyla aynı desen —
    // bkz. oradaki yorum. Webhook'un kendi "status" string alanı statusCode
    // haritasından daha güvenilir, öncelik veriyoruz.
    const newStatus = status === 'succeeded' ? 'succeeded' : (statusMap[statusCode] || payout.status);

    // Payin'deki gibi: bu webhook de imzasız. Bir payout için sahte "succeeded"
    // bildirimi kullanıcı bakiyesini doğrudan etkilemiyor (para transferi zaten
    // /payouts/create ile başlatılırken düşülmüştü) ama muhasebe kaydını "para
    // gerçekten çıktı" olarak yanlış işaretleyebilir — aynı get-status çapraz
    // doğrulamasını burada da uyguluyoruz.
    let verifiedSucceeded = true;
    if (newStatus === 'succeeded' && payout.status !== 'succeeded') {
      verifiedSucceeded = false;
      try {
        const statusCheck = await _slikairService.getPayoutStatus(payoutId);
        verifiedSucceeded = statusCheck?.status === 'succeeded';
        if (!verifiedSucceeded) {
          errorLogger.critical(
            'slikair_payout_webhook_verification_failed',
            `payoutId=${payoutId} webhook'u "succeeded" dedi ama get-status çapraz doğrulaması eşleşmedi`,
            { payoutId, webhookBody: req.body, statusCheck },
          );
        }
      } catch (e) {
        verifiedSucceeded = false;
        errorLogger.critical(
          'slikair_payout_webhook_verification_error',
          `payoutId=${payoutId} için get-status çapraz doğrulaması başarısız oldu: ${e.message}`,
          { payoutId },
        );
      }
    }

    payout.status = (newStatus === 'succeeded' && !verifiedSucceeded) ? 'processing' : newStatus;
    payout.statusCode = statusCode;
    payout.reasonCode = reasonCode || null;
    payout.webhookReceivedAt = new Date();
    if (newStatus === 'succeeded' && !verifiedSucceeded) {
      payout.metadata = {
        ...(payout.metadata || {}),
        unverifiedSucceededWebhook: { status, statusCode, amount, currency, receivedAt: new Date() },
      };
    }

    if (payout.status === 'succeeded') {
      payout.processedAt = new Date();
    }

    await payout.save();
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[Slikair] Payout webhook error:', e);
    res.status(200).json({ ok: true });
  }
}

// ── Kullanıcı: Kendi Ödeme Geçmişi ──────────────────────────────────────────

export async function getMyPayments(req, res, next) {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const filter = { userId: req.user.id };

    if (status) filter.status = status;

    const [payments, total] = await Promise.all([
      SlikairPayment.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .select('requestId payinId amount currency paymentMethod status statusCode redirectUrl createdAt webhookReceivedAt creditedAt'),
      SlikairPayment.countDocuments(filter),
    ]);

    res.json({ payments, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (e) { next(e); }
}

// ── Admin: Yatırma İşlemlerini Listele ─────────────────────────────────────

export async function getPayments(req, res, next) {
  try {
    const { page = 1, limit = 20, status, paymentMethod, userId, startDate, endDate } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const filter = {};

    if (status) filter.status = status;
    if (paymentMethod) filter.paymentMethod = paymentMethod;
    if (userId) filter.userId = userId;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const [payments, total] = await Promise.all([
      SlikairPayment.find(filter)
        .populate('userId', 'username email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      SlikairPayment.countDocuments(filter),
    ]);

    res.json({ payments, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (e) { next(e); }
}

// ── Admin: Yatırma Detayı ──────────────────────────────────────────────────

export async function getPaymentDetail(req, res, next) {
  try {
    const payment = await SlikairPayment.findById(req.params.id)
      .populate('userId', 'username email balance');
    if (!payment) throw createError(404, 'NOT_FOUND', 'İşlem bulunamadı');
    res.json({ payment });
  } catch (e) { next(e); }
}

// ── Admin: Çekim İşlemlerini Listele ───────────────────────────────────────

export async function getPayouts(req, res, next) {
  try {
    const { page = 1, limit = 20, status, method, userId, startDate, endDate } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const filter = {};

    if (status) filter.status = status;
    if (method) filter.method = method;
    if (userId) filter.userId = userId;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const [payouts, total] = await Promise.all([
      SlikairPayout.find(filter)
        .populate('userId', 'username email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      SlikairPayout.countDocuments(filter),
    ]);

    res.json({ payouts, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (e) { next(e); }
}

// ── Admin: Çekim Detayı ────────────────────────────────────────────────────

export async function getPayoutDetail(req, res, next) {
  try {
    const payout = await SlikairPayout.findById(req.params.id)
      .populate('userId', 'username email balance');
    if (!payout) throw createError(404, 'NOT_FOUND', 'İşlem bulunamadı');
    res.json({ payout });
  } catch (e) { next(e); }
}

// ── Admin: Özet İstatistikler ──────────────────────────────────────────────

export async function getStats(req, res, next) {
  try {
    const [depositStats, payoutStats] = await Promise.all([
      SlikairPayment.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 }, totalAmount: { $sum: '$amount' } } },
      ]),
      SlikairPayout.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 }, totalAmount: { $sum: '$amount' } } },
      ]),
    ]);

    const totalDeposits = depositStats.reduce((s, g) => s + g.totalAmount, 0);
    const totalPayouts = payoutStats.reduce((s, g) => s + g.totalAmount, 0);

    res.json({
      deposits: { byStatus: depositStats, total: totalDeposits },
      payouts: { byStatus: payoutStats, total: totalPayouts },
      net: totalDeposits - totalPayouts,
    });
  } catch (e) { next(e); }
}
