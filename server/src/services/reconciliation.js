/**
 * Reconciliation Framework Service (Phase 2B)
 *
 * Provides generic reconciliation mechanism to compare Core records
 * with external/provider records without coupling to specific vendors.
 */
import { ReconciliationJob, ReconciliationItem } from '../models/Reconciliation.js';
import Transaction from '../models/Transaction.js';
import Bet from '../models/Bet.js';
import CryptoDeposit from '../models/CryptoDeposit.js';

/**
 * Create a reconciliation job.
 *
 * @param {Object} data - Job data
 * @param {Object} options - Options
 * @returns {Object} Created job
 */
export async function createReconciliationJob(data, options = {}) {
  const { session = null } = options;
  const {
    name,
    description = '',
    type,
    startedBy,
    dateRange = {},
    filters = {},
  } = data;

  const job = await ReconciliationJob.create([{
    name,
    description,
    type,
    startedBy,
    dateRange,
    filters,
    status: 'pending',
  }], { session });

  return job[0];
}

/**
 * Start a reconciliation job.
 *
 * @param {String} jobId - Job ID
 * @param {Function} fetchExternalRecords - Function to fetch external records
 * @returns {Object} Updated job
 */
export async function startReconciliationJob(jobId, fetchExternalRecords) {
  const job = await ReconciliationJob.findById(jobId);
  if (!job) throw new Error('Job not found');
  if (job.status !== 'pending') throw new Error('Job is not in pending status');

  job.status = 'running';
  await job.save();

  try {
    // Fetch internal records
    const internalRecords = await fetchInternalRecords(job);

    if (internalRecords.length === INTERNAL_FETCH_CAP) {
      job.status = 'failed';
      job.error = 'Kayıt sayısı sınırı aşıldı, tarih aralığını daraltın';
      await job.save();
      return job;
    }

    // Fetch external records
    const externalRecords = await fetchExternalRecords(job);

    // Compare records
    const comparisonResult = await compareRecords(job, internalRecords, externalRecords);

    // Update job summary
    job.summary = comparisonResult.summary;
    job.status = 'completed';
    job.completedAt = new Date();
    await job.save();

    return job;
  } catch (error) {
    job.status = 'failed';
    job.error = error.message;
    await job.save();
    throw error;
  }
}

/**
 * Fetch internal records based on job configuration.
 *
 * @param {Object} job - Reconciliation job
 * @returns {Array} Internal records
 */
// Sınırsız (tarih aralığı olmayan) bir iş tüm koleksiyonu çekip binlerce
// ReconciliationItem'a dönüşmesin diye sabit bir üst sınır (savunma katmanı 2).
const INTERNAL_FETCH_CAP = 5000;

async function fetchInternalRecords(job) {
  const { type, dateRange, filters } = job;
  const query = {};

  if (dateRange.start || dateRange.end) {
    query.createdAt = {};
    if (dateRange.start) query.createdAt.$gte = new Date(dateRange.start);
    if (dateRange.end) query.createdAt.$lte = new Date(dateRange.end);
  }

  let records = [];

  switch (type) {
    case 'transaction':
      records = await Transaction.find({ ...query, ...filters }).limit(INTERNAL_FETCH_CAP).lean();
      break;
    case 'bet':
      records = await Bet.find({ ...query, ...filters }).limit(INTERNAL_FETCH_CAP).lean();
      break;
    case 'deposit':
      records = await Transaction.find({ ...query, type: 'deposit', ...filters }).limit(INTERNAL_FETCH_CAP).lean();
      break;
    case 'withdrawal':
      records = await Transaction.find({ ...query, type: 'withdraw', ...filters }).limit(INTERNAL_FETCH_CAP).lean();
      break;
    case 'cryptoDeposit': {
      // CryptoDeposit'in tutarı (usdtAmount) Transaction'ın TRY tutarından
      // farklı bir birimde (USDT) — dış kaynak da (TronGrid) USDT döndüreceği
      // için compareRecords'un jenerik amount/referenceId karşılaştırmasını
      // değiştirmeden, eşleşme alanlarını buradan senkronize ediyoruz:
      // referenceId=txHash (TronGrid'in transaction_id'siyle eşleşecek anahtar),
      // amount=usdtAmount (TRY'ye çevrilmeden, on-chain birimle karşılaştırma).
      const deposits = await CryptoDeposit.find({ ...query, ...filters }).limit(INTERNAL_FETCH_CAP).lean();
      records = deposits.map(d => ({ ...d, referenceId: d.txHash, amount: d.usdtAmount }));
      break;
    }
    default:
      records = await Transaction.find({ ...query, ...filters }).limit(INTERNAL_FETCH_CAP).lean();
  }

  return records;
}

/**
 * Compare internal and external records.
 *
 * @param {Object} job - Reconciliation job
 * @param {Array} internalRecords - Internal records
 * @param {Array} externalRecords - External records
 * @returns {Object} Comparison result
 */
async function compareRecords(job, internalRecords, externalRecords) {
  const items = [];
  const summary = {
    totalInternal: internalRecords.length,
    totalExternal: externalRecords.length,
    matched: 0,
    missingInternally: 0,
    missingExternally: 0,
    amountMismatch: 0,
    statusMismatch: 0,
    duplicate: 0,
    unresolved: 0,
  };

  // Create lookup maps
  const internalMap = new Map();
  for (const record of internalRecords) {
    const key = record.referenceId?.toString() || record._id.toString();
    if (internalMap.has(key)) {
      summary.duplicate++;
      items.push({
        jobId: job._id,
        internalRecordId: record._id.toString(),
        recordType: job.type,
        status: 'duplicate',
        internalData: record,
        notes: 'Duplicate internal record found',
      });
    } else {
      internalMap.set(key, record);
    }
  }

  const externalMap = new Map();
  for (const record of externalRecords) {
    const key = record.id || record.referenceId || record._id?.toString();
    if (key) externalMap.set(key, record);
  }

  // Compare external records with internal
  for (const [key, externalRecord] of externalMap) {
    const internalRecord = internalMap.get(key);

    if (!internalRecord) {
      summary.missingInternally++;
      items.push({
        jobId: job._id,
        externalRecordId: key,
        recordType: job.type,
        status: 'missing_internally',
        externalData: externalRecord,
        notes: 'Record exists externally but not internally',
      });
      continue;
    }

    // Check amount match
    const internalAmount = internalRecord.amount || 0;
    const externalAmount = externalRecord.amount || 0;
    if (Math.abs(internalAmount - externalAmount) > 0.01) {
      summary.amountMismatch++;
      items.push({
        jobId: job._id,
        internalRecordId: internalRecord._id.toString(),
        externalRecordId: key,
        recordType: job.type,
        status: 'amount_mismatch',
        internalData: internalRecord,
        externalData: externalRecord,
        difference: { internalAmount, externalAmount, diff: internalAmount - externalAmount },
        notes: 'Amount mismatch between internal and external records',
      });
      continue;
    }

    // Check status match
    const internalStatus = internalRecord.status || 'unknown';
    const externalStatus = externalRecord.status || 'unknown';
    if (internalStatus !== externalStatus) {
      summary.statusMismatch++;
      items.push({
        jobId: job._id,
        internalRecordId: internalRecord._id.toString(),
        externalRecordId: key,
        recordType: job.type,
        status: 'status_mismatch',
        internalData: internalRecord,
        externalData: externalRecord,
        difference: { internalStatus, externalStatus },
        notes: 'Status mismatch between internal and external records',
      });
      continue;
    }

    // Matched
    summary.matched++;
    items.push({
      jobId: job._id,
      internalRecordId: internalRecord._id.toString(),
      externalRecordId: key,
      recordType: job.type,
      status: 'matched',
      internalData: internalRecord,
      externalData: externalRecord,
      notes: 'Records matched successfully',
    });

    // Remove from maps to track missing internally
    internalMap.delete(key);
  }

  // Check for missing externally
  for (const [key, internalRecord] of internalMap) {
    summary.missingExternally++;
    items.push({
      jobId: job._id,
      internalRecordId: internalRecord._id.toString(),
      recordType: job.type,
      status: 'missing_externally',
      internalData: internalRecord,
      notes: 'Record exists internally but not externally',
    });
  }

  // Create reconciliation items
  if (items.length > 0) {
    await ReconciliationItem.insertMany(items);
  }

  summary.unresolved = items.filter(i => i.status !== 'matched').length;

  return { items, summary };
}

/**
 * Get reconciliation job by ID.
 *
 * @param {String} jobId - Job ID
 * @returns {Object} Job
 */
export async function getReconciliationJob(jobId) {
  return ReconciliationJob.findById(jobId);
}

/**
 * Get reconciliation items for a job.
 *
 * @param {String} jobId - Job ID
 * @param {Object} filters - Filter options
 * @returns {Object} Paginated items
 */
export async function getReconciliationItems(jobId, filters = {}) {
  const { page = 1, limit = 20, status = null } = filters;
  const skip = (Number(page) - 1) * Number(limit);

  const query = { jobId };
  if (status) query.status = status;

  const [items, total] = await Promise.all([
    ReconciliationItem.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    ReconciliationItem.countDocuments(query),
  ]);

  return {
    items,
    total,
    page: Number(page),
    pages: Math.ceil(total / Number(limit)),
  };
}

/**
 * Resolve a reconciliation item.
 *
 * @param {String} itemId - Item ID
 * @param {Object} resolution - Resolution data
 * @param {String} resolvedBy - User ID who resolved
 * @returns {Object} Updated item
 */
export async function resolveReconciliationItem(itemId, resolution, resolvedBy) {
  const item = await ReconciliationItem.findById(itemId);
  if (!item) throw new Error('Item not found');

  const { status, notes } = resolution;

  item.resolutionStatus = status;
  item.resolution = notes;
  item.resolvedBy = resolvedBy;
  item.resolvedAt = new Date();
  await item.save();

  return item;
}

/**
 * Get reconciliation statistics.
 *
 * @param {Object} filters - Filter options
 * @returns {Object} Statistics
 */
export async function getReconciliationStats(filters = {}) {
  const { startDate, endDate, type } = filters;

  const match = {};
  if (startDate || endDate) {
    match.createdAt = {};
    if (startDate) match.createdAt.$gte = new Date(startDate);
    if (endDate) match.createdAt.$lte = new Date(endDate);
  }
  if (type) match.type = type;

  const stats = await ReconciliationJob.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalMatched: { $sum: '$summary.matched' },
        totalUnresolved: { $sum: '$summary.unresolved' },
      },
    },
  ]);

  return stats;
}

/**
 * List reconciliation jobs.
 *
 * @param {Object} filters - Filter options
 * @returns {Object} Paginated jobs
 */
export async function listReconciliationJobs(filters = {}) {
  const { page = 1, limit = 20, status = null, type = null } = filters;
  const skip = (Number(page) - 1) * Number(limit);

  const query = {};
  if (status) query.status = status;
  if (type) query.type = type;

  const [jobs, total] = await Promise.all([
    ReconciliationJob.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    ReconciliationJob.countDocuments(query),
  ]);

  return {
    jobs,
    total,
    page: Number(page),
    pages: Math.ceil(total / Number(limit)),
  };
}
