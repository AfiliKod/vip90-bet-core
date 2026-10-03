import mongoose from 'mongoose';
import escapeStringRegexp from 'escape-string-regexp';
import PlayerSegment from '../models/PlayerSegment.js';
import User from '../models/User.js';

/**
 * Player Segmentation Service
 * Provides player segmentation based on various criteria
 */

/**
 * Create a new player segment
 */
export async function createSegment(data, options = {}) {
  const { session = null } = options;
  
  const segment = await PlayerSegment.create([data], { session });
  return segment[0];
}

/**
 * Get all segments
 */
export async function getSegments(options = {}) {
  const { page = 1, limit = 20, isActive = null, search = '' } = options;
  const skip = (Number(page) - 1) * Number(limit);
  
  const filter = {};
  if (isActive !== null) filter.isActive = isActive;
  if (search && typeof search === 'string') {
    const trimmed = search.trim().slice(0, 100);
    if (trimmed) {
      const re = new RegExp(escapeStringRegexp(trimmed), 'i');
      filter.$or = [{ name: re }, { slug: re }];
    }
  }
  
  const [segments, total, countGroups] = await Promise.all([
    PlayerSegment.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate('createdBy', 'username'),
    PlayerSegment.countDocuments(filter),
    // Sekme sayaçları + KPI şeridi: filtresiz, global dağılım.
    PlayerSegment.aggregate([
      { $group: { _id: '$isActive', count: { $sum: 1 }, players: { $sum: { $ifNull: ['$playerCount', 0] } } } },
    ]),
  ]);

  const counts = { all: 0, active: 0, inactive: 0, players: 0 };
  for (const g of countGroups) {
    counts.all += g.count;
    counts.players += g.players;
    // UI kuralı: isActive === false değilse aktif sayılır.
    if (g._id === false) counts.inactive += g.count;
    else counts.active += g.count;
  }
  
  return {
    segments,
    total,
    page: Number(page),
    pages: Math.ceil(total / Number(limit)),
    counts,
  };
}

/**
 * Get segment by ID
 */
export async function getSegmentById(id) {
  return PlayerSegment.findById(id).populate('createdBy', 'username');
}

/**
 * Get segment by slug
 */
export async function getSegmentBySlug(slug) {
  return PlayerSegment.findOne({ slug }).populate('createdBy', 'username');
}

/**
 * Update segment
 */
export async function updateSegment(id, data, options = {}) {
  const { session = null } = options;
  
  const segment = await PlayerSegment.findByIdAndUpdate(
    id,
    { $set: data },
    { new: true, session }
  ).populate('createdBy', 'username');
  
  return segment;
}

/**
 * Delete segment
 */
export async function deleteSegment(id, options = {}) {
  const { session = null } = options;
  
  await PlayerSegment.findByIdAndDelete(id, { session });
  return true;
}

/**
 * Compute players matching segment criteria
 */
export async function computeSegmentPlayers(segmentId, options = {}) {
  const { limit = 1000 } = options;
  
  const segment = await PlayerSegment.findById(segmentId);
  if (!segment) throw new Error('Segment not found');
  
  const query = buildQueryFromCriteria(segment.criteria);
  
  const players = await User.find(query)
    .select('username email balance vipLevel totalWagered lastLoginAt country createdAt')
    .limit(limit)
    .lean();
  
  // Update segment stats
  const count = await User.countDocuments(query);
  segment.stats.playerCount = count;
  segment.stats.lastComputed = new Date();
  await segment.save();
  
  return { players, count };
}

/**
 * Get players for a segment (with pagination)
 */
export async function getSegmentPlayers(segmentId, options = {}) {
  const { page = 1, limit = 20 } = options;
  const skip = (Number(page) - 1) * Number(limit);
  
  const segment = await PlayerSegment.findById(segmentId);
  if (!segment) throw new Error('Segment not found');
  
  const query = buildQueryFromCriteria(segment.criteria);
  
  const [players, total] = await Promise.all([
    User.find(query)
      .select('username email balance vipLevel totalWagered lastLoginAt country createdAt')
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    User.countDocuments(query),
  ]);
  
  return {
    players,
    total,
    page: Number(page),
    pages: Math.ceil(total / Number(limit)),
  };
}

/**
 * Build MongoDB query from segment criteria
 */
function buildQueryFromCriteria(criteria) {
  const query = {};

  // Sayısal aralıklar: yalnız EN AZ BİR sınır gerçek bir sayıysa alan eklenir.
  // `!== null` denetimi `undefined` için de geçerli olduğundan, kriteri
  // tanımlanmamış bir alan operatörsüz `{ vipLevel: {} }` üretiyordu — bu
  // Mongo'da "boş dokümanla tam eşleşme" demek, yani segment sessizce HİÇ KİŞİ
  // bulmak (veya hiç bulamamak) demekti. `typeof === 'number'` hem `null`'ı hem
  // `undefined`'i eler.
  const bound = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  
  // VIP level
  if (bound(criteria.vipLevel?.min) !== null || bound(criteria.vipLevel?.max) !== null) {
    query.vipLevel = {};
    if (bound(criteria.vipLevel?.min) !== null) query.vipLevel.$gte = criteria.vipLevel.min;
    if (bound(criteria.vipLevel?.max) !== null) query.vipLevel.$lte = criteria.vipLevel.max;
  }
  
  // Balance
  if (bound(criteria.balance?.min) !== null || bound(criteria.balance?.max) !== null) {
    query.balance = {};
    if (bound(criteria.balance?.min) !== null) query.balance.$gte = criteria.balance.min;
    if (bound(criteria.balance?.max) !== null) query.balance.$lte = criteria.balance.max;
  }
  
  // Total wagered
  if (bound(criteria.totalWagered?.min) !== null || bound(criteria.totalWagered?.max) !== null) {
    query.totalWagered = {};
    if (bound(criteria.totalWagered?.min) !== null) query.totalWagered.$gte = criteria.totalWagered.min;
    if (bound(criteria.totalWagered?.max) !== null) query.totalWagered.$lte = criteria.totalWagered.max;
  }
  
  // Registration date
  if (criteria.registeredAt?.from || criteria.registeredAt?.to) {
    query.createdAt = {};
    if (criteria.registeredAt?.from) query.createdAt.$gte = criteria.registeredAt.from;
    if (criteria.registeredAt?.to) query.createdAt.$lte = criteria.registeredAt.to;
  }
  
  // Last login date
  if (criteria.lastLoginAt?.from || criteria.lastLoginAt?.to) {
    query.lastLoginAt = {};
    if (criteria.lastLoginAt?.from) query.lastLoginAt.$gte = criteria.lastLoginAt.from;
    if (criteria.lastLoginAt?.to) query.lastLoginAt.$lte = criteria.lastLoginAt.to;
  }
  
  // Countries
  if (criteria.countries?.length > 0) {
    query.country = { $in: criteria.countries };
  }
  
  // Active status — `boolean` olmalı; `undefined` de `!== null` testini geçiyordu.
  if (typeof criteria.isActive === 'boolean') {
    query.deletedAt = criteria.isActive ? { $exists: false } : { $exists: true };
  }
  
  // Bot status
  if (typeof criteria.isBot === 'boolean') {
    query.isBot = criteria.isBot;
  }
  
  // Tags
  if (criteria.tags?.length > 0) {
    query.tags = { $in: criteria.tags };
  }
  
  return query;
}

/**
 * Get segment statistics
 */
export async function getSegmentStats(segmentId) {
  const segment = await PlayerSegment.findById(segmentId);
  if (!segment) throw new Error('Segment not found');
  
  const query = buildQueryFromCriteria(segment.criteria);
  
  const [count, aggregate] = await Promise.all([
    User.countDocuments(query),
    User.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalBalance: { $sum: '$balance' },
          totalWagered: { $sum: '$totalWagered' },
          avgBalance: { $avg: '$balance' },
          avgWagered: { $avg: '$totalWagered' },
        },
      },
    ]),
  ]);
  
  const stats = aggregate[0] || {};
  
  return {
    playerCount: count,
    totalBalance: stats.totalBalance || 0,
    totalWagered: stats.totalWagered || 0,
    avgBalance: stats.avgBalance || 0,
    avgWagered: stats.avgWagered || 0,
    lastComputed: segment.stats.lastComputed,
  };
}

/**
 * Bulk update segment stats
 */
export async function updateAllSegmentStats() {
  const segments = await PlayerSegment.find({ isActive: true });
  
  for (const segment of segments) {
    const query = buildQueryFromCriteria(segment.criteria);
    const count = await User.countDocuments(query);
    
    segment.stats.playerCount = count;
    segment.stats.lastComputed = new Date();
    await segment.save();
  }

  return { updated: segments.length };
}

/**
 * Segments sayfası tamamen boştu — engine (kriter modeli, computeSegmentPlayers)
 * baştan beri tam çalışır durumdaydı ama hiç varsayılan segment yoktu (denetim
 * bulgusu). Tarih-aralığı kriterleri (registeredAt/lastLoginAt) burada
 * KULLANILMIYOR — sabit bir Date ile oluşturulup zamanla "eskirlerdi"
 * (ör. "son 30 gün" oluşturulduğu anda dondurulup asla kaymaz). Bunun yerine
 * zamana bağlı olmayan, kalıcı anlamlı eşikler seçildi.
 */
export async function initDefaultSegments() {
  const count = await PlayerSegment.countDocuments();
  if (count > 0) return;

  const defaults = [
    {
      name: 'VIP Oyuncular', slug: 'vip-players',
      description: 'VIP seviyesi 3 ve üzeri oyuncular',
      criteria: { vipLevel: { min: 3 } },
    },
    {
      name: 'Yüksek Bakiyeli Oyuncular', slug: 'high-balance-players',
      description: 'Güncel bakiyesi 1000 ve üzeri oyuncular',
      criteria: { balance: { min: 1000 } },
    },
    {
      name: 'Yüksek Hacimli Oyuncular', slug: 'high-volume-players',
      description: 'Toplam çevrimi 5000 ve üzeri oyuncular',
      criteria: { totalWagered: { min: 5000 } },
    },
    {
      name: 'Düşük Aktiviteli Oyuncular', slug: 'low-activity-players',
      description: 'Toplam çevrimi 50\'nin altında kalan, riskli/kayıp adayı oyuncular',
      criteria: { totalWagered: { max: 50 } },
    },
  ];

  for (const data of defaults) {
    const segment = await createSegment(data);
    await computeSegmentPlayers(segment._id);
  }
}

/**
 * Segment kriterlerini ham bir User sorgusuna çevirir.
 * `buildQueryFromCriteria` dosya içinde özel (private) kaldı; SMS gönderimi gibi
 * bu dosyada yaşamayan tüketiciler de aynı mantığı kullanmalı — kriteri
 * kopyalamak iki yerde kopma (drift) riski demektir.
 */
export { buildQueryFromCriteria as buildSegmentQuery };
