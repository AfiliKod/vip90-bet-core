import * as reconciliationService from '../services/reconciliation.js';
import User from '../models/User.js';
import { deriveDepositAddress, fetchIncomingUSDT } from '../services/cryptoService.js';
import { errorLogger } from '../services/errorLogger.js';

// Testlerin deriveDepositAddress/fetchIncomingUSDT'yi (gerçek TronGrid ağ
// isteği yapmadan) taklit edebilmesi için — slikairController.js'teki
// _setSlikairService deseniyle tutarlı.
let _cryptoService = { deriveDepositAddress, fetchIncomingUSDT };
export function _setCryptoService(svc) { _cryptoService = svc; }
export function _getCryptoService() { return _cryptoService; }

// TronGrid toplu sorgu sunmuyor — her kullanıcının türetilmiş adresi için ayrı
// bir istek gerekiyor. Kullanıcı tabanı büyüdükçe bu iş sessizce eksik/yavaş
// veri üretmesin diye, INTERNAL_FETCH_CAP'teki "sessizce kırpmak yerine açıkça
// başarısız ol" deseniyle tutarlı bir üst sınır konuyor.
const CRYPTO_ADDRESS_FETCH_CAP = 300;

/**
 * cryptoDeposit tipi mutabakat işleri için dış kayıt kaynağı: Slikair'den
 * farklı olarak burada gerçek bir "kaynak" var — TronGrid'in kendisi, çünkü
 * her USDT yatırma zaten zincir üzerinde herkese açık. Kripto yatırma indexi
 * atanmış her kullanıcının adresi için TronGrid'e ayrı ayrı sorulup job'ın
 * dateRange'i ile filtreleniyor.
 */
export async function fetchCryptoExternalRecords(job) {
  const sinceMs = job.dateRange?.start ? new Date(job.dateRange.start).getTime() : 0;
  const untilMs = job.dateRange?.end ? new Date(job.dateRange.end).getTime() : null;

  const users = await User.find(
    { cryptoDepositIndex: { $ne: null } },
    { cryptoDepositIndex: 1 }
  ).limit(CRYPTO_ADDRESS_FETCH_CAP + 1).lean();

  if (users.length > CRYPTO_ADDRESS_FETCH_CAP) {
    throw new Error(
      `Kripto yatırma adresi olan kullanıcı sayısı (${users.length}) TronGrid tarama sınırını (${CRYPTO_ADDRESS_FETCH_CAP}) aşıyor — bu iş türü şu an bu ölçekte desteklenmiyor`
    );
  }

  const records = [];
  const failedAddresses = [];

  for (const u of users) {
    const address = _cryptoService.deriveDepositAddress(u.cryptoDepositIndex);
    try {
      const txs = await _cryptoService.fetchIncomingUSDT(address, sinceMs);
      for (const tx of txs) {
        const tsMs = Number(tx.block_timestamp) || 0;
        if (untilMs && tsMs > untilMs) continue;
        records.push({
          id: tx.transaction_id,
          amount: Number(tx.value) / 1_000_000,
          currency: 'USDT',
          toAddress: address,
          timestamp: tsMs,
          // compareRecords internal/external 'status' alanlarını karşılaştırıyor;
          // TronGrid'de zincir-dışı bir "status" kavramı yok (bir transfer ya
          // zincirde onaylıdır ya da hiç dönmez), o yüzden CryptoDeposit'in
          // 'credited' değeriyle eşlenen bir sabit veriyoruz. Böylece gerçekten
          // kredilenmiş+tutarı doğru kayıtlar 'matched' olur, ama zincirde
          // görünüp hâlâ 'pending_approval'/'rejected' kalan kayıtlar bilinçli
          // olarak 'status_mismatch' düşer — admin'in gözden geçirmesi gereken
          // tam da bu durum (para geldi ama hesaba işlenmedi/reddedildi).
          status: 'credited',
        });
      }
    } catch (e) {
      failedAddresses.push({ address, error: e.message });
    }
  }

  if (failedAddresses.length > 0) {
    errorLogger.critical(
      'reconciliation_crypto_fetch_partial',
      `Kripto mutabakat işinde ${failedAddresses.length}/${users.length} adres için TronGrid sorgusu başarısız oldu — sonuç eksik veriye dayanıyor olabilir`,
      { jobId: job._id, failedAddresses },
    );
  }

  return records;
}

/**
 * List reconciliation jobs
 */
export async function listJobs(req, res, next) {
  try {
    const { page, limit, status, type } = req.query;
    const result = await reconciliationService.listReconciliationJobs({
      page, limit, status, type,
    });
    res.json(result);
  } catch (e) { next(e); }
}

/**
 * Create a new reconciliation job
 */
export async function createJob(req, res, next) {
  try {
    const { name, description, type, dateRange, filters } = req.body;
    const job = await reconciliationService.createReconciliationJob({
      name,
      description,
      type,
      startedBy: req.user.id,
      dateRange,
      filters,
    });
    res.status(201).json({ job });
  } catch (e) { next(e); }
}

/**
 * Get reconciliation job by ID
 */
export async function getJob(req, res, next) {
  try {
    const job = await reconciliationService.getReconciliationJob(req.params.id);
    if (!job) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'İş bulunamadı' } });
    res.json({ job });
  } catch (e) { next(e); }
}

/**
 * Start a reconciliation job
 */
export async function startJob(req, res, next) {
  try {
    // cryptoDeposit: gerçek dış kaynak (TronGrid, bkz. fetchCryptoExternalRecords).
    // Diğer tipler (bank/Slikair kanalları) için henüz gerçek bir entegratör
    // yok — bkz. docs/product/09-bilinen-kisitlar.md § Reconciliation.
    const mockFetchExternal = async () => [];

    const fetchExternal = async (job) => {
      if (job.type === 'cryptoDeposit') return fetchCryptoExternalRecords(job);
      return mockFetchExternal(job);
    };

    const job = await reconciliationService.startReconciliationJob(req.params.id, fetchExternal);
    res.json({ job });
  } catch (e) { next(e); }
}

/**
 * Get reconciliation items for a job
 */
export async function getJobItems(req, res, next) {
  try {
    const { page, limit, status } = req.query;
    const result = await reconciliationService.getReconciliationItems(req.params.id, {
      page, limit, status,
    });
    res.json(result);
  } catch (e) { next(e); }
}

/**
 * Resolve a reconciliation item
 */
export async function resolveItem(req, res, next) {
  try {
    const { status, notes } = req.body;
    const item = await reconciliationService.resolveReconciliationItem(
      req.params.itemId,
      { status, notes },
      req.user.id
    );
    res.json({ item });
  } catch (e) { next(e); }
}

/**
 * Get reconciliation statistics
 */
export async function getStats(req, res, next) {
  try {
    const { startDate, endDate, type } = req.query;
    const stats = await reconciliationService.getReconciliationStats({
      startDate, endDate, type,
    });
    res.json({ stats });
  } catch (e) { next(e); }
}
