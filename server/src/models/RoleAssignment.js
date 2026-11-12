import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

/**
 * Platform model: Scoped Role Assignments (spec §4.3.8).
 * Scopes:
 * - 'platform': system-wide administrative roles (scopeId = null)
 * - 'partner': roles within a partner organization (scopeId = partnerId)
 * - 'tenant': roles within an operator tenant (scopeId = tenantId)
 *
 * Never apply the `tenantScoped` plugin to this model.
 */
const roleAssignmentSchema = new mongoose.Schema({
  staffId: {
    type: ObjectId,
    ref: 'StaffAccount',
    required: true,
    index: true,
  },
  roleId: {
    type: ObjectId,
    ref: 'Role',
    required: true,
  },
  scopeType: {
    type: String,
    enum: ['platform', 'partner', 'tenant'],
    required: true,
    index: true,
  },
  scopeId: {
    type: ObjectId,
    default: null,
    index: true,
  },
  grantedBy: {
    type: ObjectId,
    ref: 'StaffAccount',
    default: null,
  },
}, { timestamps: true });

// Compound unique index: a staff member cannot be assigned the same role twice in the same scope
roleAssignmentSchema.index({ staffId: 1, scopeType: 1, scopeId: 1, roleId: 1 }, { unique: true });

/**
 * Asserts that a staff member holding a partner-scoped role is not assigned a tenant-scoped role
 * on an operator linked to that partner (spec §4.3.4, §4.3.8, G-15).
 *
 * @param {string|mongoose.Types.ObjectId} staffId
 * @param {string|mongoose.Types.ObjectId} tenantId
 * @param {object} [options]
 * @returns {Promise<boolean>}
 * @throws {Error} if self-assignment violation is detected
 */
export async function assertNoPartnerSelfAssignment(staffId, tenantId, options = {}) {
  if (!staffId || !tenantId) return true;

  if (typeof options.isLinked === 'function') {
    const isLinked = await options.isLinked(staffId, tenantId);
    if (isLinked) {
      const err = new Error('PARTNER_SELF_ASSIGNMENT_FORBIDDEN: Partner staff cannot be assigned roles on linked tenant');
      err.code = 'PARTNER_SELF_ASSIGNMENT_FORBIDDEN';
      err.statusCode = 403;
      throw err;
    }
  } else if (options.isLinked === true) {
    const err = new Error('PARTNER_SELF_ASSIGNMENT_FORBIDDEN: Partner staff cannot be assigned roles on linked tenant');
    err.code = 'PARTNER_SELF_ASSIGNMENT_FORBIDDEN';
    err.statusCode = 403;
    throw err;
  }

  const sId = mongoose.Types.ObjectId.isValid(staffId) ? new mongoose.Types.ObjectId(staffId) : staffId;
  const tId = mongoose.Types.ObjectId.isValid(tenantId) ? new mongoose.Types.ObjectId(tenantId) : tenantId;

  const RoleAssignmentModel = mongoose.models.RoleAssignment || mongoose.model('RoleAssignment', roleAssignmentSchema);

  // Find all partner-scoped assignments for this staff member
  const partnerAssignments = await RoleAssignmentModel.find({
    staffId: sId,
    scopeType: 'partner',
  }).select('scopeId').lean();

  if (!partnerAssignments || partnerAssignments.length === 0) {
    return true;
  }

  const partnerIds = partnerAssignments.map(a => a.scopeId).filter(Boolean);
  if (partnerIds.length === 0) {
    return true;
  }

  const partnerIdStrings = new Set(partnerIds.map(id => String(id)));
  const partnerObjectIds = partnerIds.map(id => mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id);

  let isLinked = false;
  const now = new Date();

  // 1. Check PartnerOperatorLink model if registered
  if (mongoose.models.PartnerOperatorLink) {
    const link = await mongoose.models.PartnerOperatorLink.findOne({
      partnerId: { $in: partnerObjectIds },
      tenantId: tId,
      $or: [
        { validTo: null },
        { validTo: { $exists: false } },
        { validTo: { $gt: now } },
      ],
    }).lean();
    if (link) isLinked = true;
  }

  // 2. Check partneroperatorlinks raw collection if link model not registered or not found
  if (!isLinked && mongoose.connection && mongoose.connection.readyState === 1) {
    try {
      const link = await mongoose.connection.collection('partneroperatorlinks').findOne({
        partnerId: { $in: partnerObjectIds },
        tenantId: tId,
        $or: [
          { validTo: null },
          { validTo: { $exists: false } },
          { validTo: { $gt: now } },
        ],
      });
      if (link) isLinked = true;
    } catch {
      // Collection may not exist in current DB yet
    }
  }

  // 3. Check Tenant document for partnerId or direct link
  if (!isLinked) {
    try {
      const TenantModel = mongoose.models.Tenant || (mongoose.connection && mongoose.connection.models.Tenant);
      if (TenantModel) {
        const tenant = await TenantModel.findById(tId).select('partnerId').lean();
        if (tenant && tenant.partnerId && partnerIdStrings.has(String(tenant.partnerId))) {
          isLinked = true;
        }
      } else if (mongoose.connection && mongoose.connection.readyState === 1) {
        const tenant = await mongoose.connection.collection('tenants').findOne({ _id: tId }, { projection: { partnerId: 1 } });
        if (tenant && tenant.partnerId && partnerIdStrings.has(String(tenant.partnerId))) {
          isLinked = true;
        }
      }
    } catch {
      // Ignore tenant lookup errors
    }
  }

  if (isLinked) {
    const err = new Error('PARTNER_SELF_ASSIGNMENT_FORBIDDEN: Partner staff cannot be assigned roles on linked tenant');
    err.code = 'PARTNER_SELF_ASSIGNMENT_FORBIDDEN';
    err.statusCode = 403;
    throw err;
  }

  return true;
}

// Pre-save hook enforcing anti-self-assignment constraint
roleAssignmentSchema.pre('save', async function () {
  if (this.scopeType === 'tenant' && this.scopeId) {
    await assertNoPartnerSelfAssignment(this.staffId, this.scopeId);
  }
});

roleAssignmentSchema.statics.assertNoPartnerSelfAssignment = assertNoPartnerSelfAssignment;

const RoleAssignment = mongoose.models.RoleAssignment || mongoose.model('RoleAssignment', roleAssignmentSchema);

export default RoleAssignment;
