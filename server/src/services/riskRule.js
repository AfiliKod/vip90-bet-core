import RiskRule, { RULE_ACTION, RULE_CATEGORY } from '../models/RiskRule.js';
import { logAuditEvent } from './audit.js';

function translateDuplicateNameError(err) {
  if (err?.code === 11000 && err?.keyPattern?.name) {
    const e = new Error('Bu isimde bir risk kuralı zaten var');
    e.status = 409;
    e.code = 'DUPLICATE_RULE_NAME';
    return e;
  }
  return err;
}

export async function createRule(data, adminId) {
  let rule;
  try {
    rule = await RiskRule.create(data);
  } catch (err) {
    throw translateDuplicateNameError(err);
  }
  await logAuditEvent({
    actorId: adminId,
    actorType: 'admin',
    actorUsername: 'admin',
    action: 'risk.rule.create',
    category: 'system',
    targetType: 'risk_rule',
    targetId: rule._id.toString(),
    after: rule.toObject(),
  });
  return rule;
}

export async function updateRule(ruleId, updates, adminId) {
  const before = await RiskRule.findById(ruleId).lean();
  let rule;
  try {
    rule = await RiskRule.findByIdAndUpdate(ruleId, updates, { new: true, runValidators: true });
  } catch (err) {
    throw translateDuplicateNameError(err);
  }
  if (!rule) throw new Error('Rule not found');
  await logAuditEvent({
    actorId: adminId,
    actorType: 'admin',
    actorUsername: 'admin',
    action: 'risk.rule.update',
    category: 'system',
    targetType: 'risk_rule',
    targetId: ruleId,
    before,
    after: rule.toObject(),
  });
  return rule;
}

export async function deleteRule(ruleId, adminId) {
  const rule = await RiskRule.findByIdAndDelete(ruleId);
  if (!rule) throw new Error('Rule not found');
  await logAuditEvent({
    actorId: adminId,
    actorType: 'admin',
    actorUsername: 'admin',
    action: 'risk.rule.delete',
    category: 'system',
    targetType: 'risk_rule',
    targetId: ruleId,
    before: rule.toObject(),
  });
  return rule;
}

export async function toggleRule(ruleId, enabled, adminId) {
  const rule = await RiskRule.findByIdAndUpdate(ruleId, { enabled }, { new: true });
  if (!rule) throw new Error('Rule not found');
  await logAuditEvent({
    actorId: adminId,
    actorType: 'admin',
    actorUsername: 'admin',
    action: enabled ? 'risk.rule.enable' : 'risk.rule.disable',
    category: 'system',
    targetType: 'risk_rule',
    targetId: ruleId,
    after: { enabled },
  });
  return rule;
}

export async function getRules(filters = {}) {
  const { category, enabled, brandId, jurisdictionId, page = 1, limit = 50 } = filters;
  const query = {};
  if (category) query.category = category;
  if (enabled !== undefined) query.enabled = enabled;
  // brandId ve jurisdictionId birlikte gelirse ikisi de query.$or'u sırayla
  // EZERDİ (ikinci atama birinciyi kaybettirir) — $and içinde ayrı $or'lar
  // olarak birleştir (getActiveRulesForScope'taki doğru desenle aynı).
  const scopeConditions = [];
  if (brandId) scopeConditions.push({ $or: [{ brandScope: { $size: 0 } }, { brandScope: brandId }] });
  if (jurisdictionId) scopeConditions.push({ $or: [{ jurisdictionScope: { $size: 0 } }, { jurisdictionScope: jurisdictionId }] });
  if (scopeConditions.length) query.$and = scopeConditions;

  const skip = (Number(page) - 1) * Number(limit);
  const [rules, total] = await Promise.all([
    RiskRule.find(query).sort({ priority: -1 }).skip(skip).limit(Number(limit)),
    RiskRule.countDocuments(query),
  ]);
  return { rules, total, page: Number(page), pages: Math.ceil(total / Number(limit)) };
}

export async function getRuleById(ruleId) {
  return RiskRule.findById(ruleId);
}

export async function getActiveRulesForScope(brandId, jurisdictionId) {
  const query = {
    enabled: true,
    $and: [
      {
        $or: [
          { brandScope: { $size: 0 } },
          { brandScope: brandId },
        ],
      },
      {
        $or: [
          { jurisdictionScope: { $size: 0 } },
          { jurisdictionScope: jurisdictionId },
        ],
      },
    ],
  };
  return RiskRule.find(query).sort({ priority: -1 });
}

function evaluateCondition(fieldValue, operator, conditionValue) {
  switch (operator) {
    case 'gt': return fieldValue > conditionValue;
    case 'gte': return fieldValue >= conditionValue;
    case 'lt': return fieldValue < conditionValue;
    case 'lte': return fieldValue <= conditionValue;
    case 'eq': return fieldValue === conditionValue;
    case 'neq': return fieldValue !== conditionValue;
    case 'in': return Array.isArray(conditionValue) && conditionValue.includes(fieldValue);
    case 'nin': return Array.isArray(conditionValue) && !conditionValue.includes(fieldValue);
    case 'contains': return String(fieldValue).includes(String(conditionValue));
    case 'between': {
      const [min, max] = Array.isArray(conditionValue) ? conditionValue : [0, 0];
      return fieldValue >= min && fieldValue <= max;
    }
    default: return false;
  }
}

export function evaluateRule(rule, signalData) {
  if (!rule.enabled) return false;

  const results = rule.conditions.map(condition => {
    const fieldValue = getNestedValue(signalData, condition.field);
    return evaluateCondition(fieldValue, condition.operator, condition.value);
  });

  if (rule.conditionLogic === 'or') {
    return results.some(Boolean);
  }
  return results.every(Boolean);
}

function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => {
    return current != null ? current[key] : undefined;
  }, obj);
}

/**
 * RiskRule.name üzerindeki unique index'in temiz kurulabilmesi için, bu
 * index eklenmeden ÖNCEKİ eşzamanlı initDefaultRules() çağrılarından kalmış
 * olabilecek aynı-isimli kayıtları temizler (en eskisini tutar). Boot'ta
 * initDefaultRules()'tan önce çağrılmalı — unique index dolu bir
 * koleksiyonda çift kayıt varken kurulamaz.
 */
export async function dedupeRuleNames() {
  const dupes = await RiskRule.aggregate([
    { $sort: { createdAt: 1 } },
    { $group: { _id: '$name', ids: { $push: '$_id' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ]);
  for (const group of dupes) {
    const [, ...extras] = group.ids; // ilkini (en eski) tut, gerisini sil
    if (extras.length) await RiskRule.deleteMany({ _id: { $in: extras } });
  }
}

export async function initDefaultRules() {
  const count = await RiskRule.countDocuments();
  if (count > 0) return;

  const defaults = [
    {
      name: 'High Deposit Velocity',
      description: 'Flag players with unusually high deposit frequency',
      category: RULE_CATEGORY.DEPOSIT,
      conditions: [
        { field: 'depositCount1h', operator: 'gte', value: 5 },
      ],
      action: RULE_ACTION.REVIEW,
      severity: 'HIGH',
      reasonCode: 'RISK_HIGH_DEPOSIT_VELOCITY',
      priority: 100,
    },
    {
      name: 'Rapid Deposit-Withdrawal',
      description: 'Flag withdrawal within 10 minutes of deposit',
      category: RULE_CATEGORY.WITHDRAWAL,
      conditions: [
        { field: 'minutesSinceDeposit', operator: 'lte', value: 10 },
      ],
      action: RULE_ACTION.REVIEW,
      severity: 'HIGH',
      reasonCode: 'RISK_RAPID_DEPOSIT_WITHDRAWAL',
      priority: 90,
    },
    {
      name: 'Repeated KYC Failures',
      description: 'Flag players with multiple KYC failures',
      category: RULE_CATEGORY.KYC,
      conditions: [
        { field: 'kycFailureCount', operator: 'gte', value: 3 },
      ],
      action: RULE_ACTION.RESTRICT,
      severity: 'HIGH',
      reasonCode: 'RISK_KYC_FAILURES',
      priority: 80,
    },
    {
      name: 'Repeated Failed Login',
      description: 'Flag repeated failed login attempts',
      category: RULE_CATEGORY.AUTHENTICATION,
      conditions: [
        { field: 'failedLoginCount1h', operator: 'gte', value: 5 },
      ],
      action: RULE_ACTION.REVIEW,
      severity: 'MEDIUM',
      reasonCode: 'RISK_REPEATED_FAILED_LOGIN',
      priority: 70,
    },
    {
      name: 'Unusual Withdrawal Amount',
      description: 'Flag unusually large withdrawal amounts',
      category: RULE_CATEGORY.WITHDRAWAL,
      conditions: [
        { field: 'withdrawalAmount', operator: 'gt', value: 50000 },
      ],
      action: RULE_ACTION.REVIEW,
      severity: 'MEDIUM',
      reasonCode: 'RISK_UNUSUAL_WITHDRAWAL_AMOUNT',
      priority: 60,
    },
    {
      name: 'Multiple Accounts Same IP',
      description: 'Flag multiple accounts from same IP for review',
      category: RULE_CATEGORY.ACCOUNT,
      conditions: [
        { field: 'accountsSameIp', operator: 'gte', value: 3 },
      ],
      action: RULE_ACTION.REVIEW,
      severity: 'HIGH',
      reasonCode: 'RISK_MULTIPLE_ACCOUNTS_SAME_IP',
      priority: 110,
    },
    {
      name: 'Large First Deposit',
      description: 'Flag unusually large first deposit shortly after registration',
      category: RULE_CATEGORY.DEPOSIT,
      conditions: [
        { field: 'firstDepositAmount', operator: 'gte', value: 10000 },
      ],
      action: RULE_ACTION.REVIEW,
      severity: 'HIGH',
      reasonCode: 'RISK_LARGE_FIRST_DEPOSIT',
      priority: 95,
    },
    {
      name: 'Withdrawal Before KYC Approval',
      description: 'Flag repeated withdrawal attempts while KYC is not approved',
      category: RULE_CATEGORY.WITHDRAWAL,
      conditionLogic: 'and',
      conditions: [
        { field: 'kycApproved', operator: 'eq', value: false },
        { field: 'withdrawalAttempts', operator: 'gte', value: 2 },
      ],
      action: RULE_ACTION.REVIEW,
      severity: 'HIGH',
      reasonCode: 'RISK_WITHDRAW_BEFORE_KYC',
      priority: 85,
    },
    {
      name: 'Rapid Full Withdrawal After Deposit',
      description: 'Flag near-full withdrawal soon after deposit (money-laundering pattern)',
      category: RULE_CATEGORY.FINANCIAL,
      conditionLogic: 'and',
      conditions: [
        { field: 'minutesSinceDeposit', operator: 'lte', value: 60 },
        { field: 'withdrawalRatioPct', operator: 'gte', value: 95 },
      ],
      action: RULE_ACTION.RESTRICT,
      severity: 'CRITICAL',
      reasonCode: 'RISK_RAPID_FULL_WITHDRAWAL',
      priority: 105,
    },
    {
      name: 'Shared Payment Method',
      description: 'Flag same payment instrument used across multiple accounts',
      category: RULE_CATEGORY.ACCOUNT,
      conditions: [
        { field: 'paymentMethodAccountCount', operator: 'gte', value: 2 },
      ],
      action: RULE_ACTION.REVIEW,
      severity: 'MEDIUM',
      reasonCode: 'RISK_SHARED_PAYMENT_METHOD',
      priority: 65,
    },
    {
      name: 'Rapid KYC Rejections',
      description: 'Flag multiple KYC rejections within a short window',
      category: RULE_CATEGORY.KYC,
      conditions: [
        { field: 'kycRejections24h', operator: 'gte', value: 2 },
      ],
      action: RULE_ACTION.RESTRICT,
      severity: 'HIGH',
      reasonCode: 'RISK_RAPID_KYC_REJECTIONS',
      priority: 75,
    },
  ];

  // findOneAndUpdate+upsert (name bazlı) yerine RiskRule.create() kullanmak,
  // initDefaultRules()'un boot'ta (server.js) ve riskSeed.ensureRulesAndPool()'da
  // eşzamanlı tetiklenmesi durumunda her iki çağrının da yukarıdaki
  // countDocuments()===0 kontrolünü aynı anda geçip 11 varsayılan kuralı
  // ÇİFT eklemesine yol açıyordu (ikisi arasında atomik bir kilit yoktu).
  // Her kural kendi 'name'ine göre upsert edildiği için MongoDB bu işlemi
  // doküman bazında atomik yapıyor — iki eşzamanlı çağrı olsa bile aynı
  // isimde ikinci kez insert olmaz, sadece no-op update olur.
  for (const rule of defaults) {
    await RiskRule.findOneAndUpdate(
      { name: rule.name },
      { $setOnInsert: rule },
      { upsert: true, setDefaultsOnInsert: true }
    );
  }
}
