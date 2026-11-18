import ProviderFeeSchedule from '../../models/ProviderFeeSchedule.js';
import Tenant from '../../models/Tenant.js';
import { createError } from '../../middleware/error.js';
import { writePlatformLevelAudit } from '../services/platformAudit.js';

function asDate(value, field) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) {
    throw createError(400, 'INVALID_PROVIDER_FEE_SCHEDULE', `${field} must be a valid date`);
  }
  return date;
}

function scheduleScope(tenantId) {
  return tenantId || null;
}

export async function listProviderFeeSchedules(req, res, next) {
  try {
    const [schedules, tenants] = await Promise.all([
      ProviderFeeSchedule.find({})
        .populate('tenantId', 'key name')
        .sort({ provider: 1, tenantId: 1, validFrom: -1 })
        .lean(),
      Tenant.find({}).select('key name').sort({ name: 1 }).lean(),
    ]);
    res.json({ schedules, tenants });
  } catch (err) {
    next(err);
  }
}

export async function createProviderFeeSchedule(req, res, next) {
  try {
    const {
      tenantId,
      provider,
      rateOfGgr,
      minimumMonthlyFee,
      currency,
      validFrom,
      note,
    } = req.body;
    if (!String(provider || '').trim() || rateOfGgr === undefined || !currency) {
      return next(createError(400, 'PROVIDER_RATEOFGGR_AND_CURRENCY_ARE_REQUIRED', 'provider, rateOfGgr, and currency are required'));
    }

    const start = asDate(validFrom, 'validFrom');
    const scopeTenantId = scheduleScope(tenantId);
    const parsedRate = Number(rateOfGgr);
    if (!Number.isFinite(parsedRate) || parsedRate < 0 || parsedRate > 1) {
      return next(createError(400, 'INVALID_PROVIDER_FEE_SCHEDULE', 'rateOfGgr must be between 0 and 1'));
    }

    // A contract amendment closes the previous open schedule at its effective time.
    await ProviderFeeSchedule.updateMany(
      { tenantId: scopeTenantId, provider: String(provider).trim(), validTo: null },
      { validTo: start },
    );

    const schedule = await ProviderFeeSchedule.create({
      tenantId: scopeTenantId,
      provider: String(provider).trim(),
      rateOfGgr: parsedRate,
      minimumMonthlyFee,
      currency,
      validFrom: start,
      createdBy: req.staff.id,
      note,
    });

    await writePlatformLevelAudit(req, 'billing:provider_fee_schedule:create', {
      targetType: 'provider_fee_schedule',
      targetId: String(schedule._id),
      metadata: { tenantId: scopeTenantId ? String(scopeTenantId) : null, provider: schedule.provider, rateOfGgr: schedule.rateOfGgr },
    });

    res.status(201).json(schedule);
  } catch (err) {
    next(err);
  }
}

export async function closeProviderFeeSchedule(req, res, next) {
  try {
    const validTo = asDate(req.body.validTo, 'validTo');
    const schedule = await ProviderFeeSchedule.findOne({ _id: req.params.id, validTo: null });
    if (!schedule) return next(createError(404, 'NOT_FOUND', 'Provider fee schedule not found'));
    if (validTo < schedule.validFrom) {
      return next(createError(400, 'INVALID_PROVIDER_FEE_SCHEDULE', 'validTo must be on or after validFrom'));
    }

    schedule.validTo = validTo;
    await schedule.save();

    await writePlatformLevelAudit(req, 'billing:provider_fee_schedule:close', {
      targetType: 'provider_fee_schedule',
      targetId: String(schedule._id),
      metadata: { provider: schedule.provider, validTo: schedule.validTo.toISOString() },
    });

    res.json({ schedule });
  } catch (err) {
    next(err);
  }
}
