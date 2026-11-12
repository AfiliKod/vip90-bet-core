import StaffAccount from '../../models/StaffAccount.js';
import RoleAssignment from '../../models/RoleAssignment.js';

export async function listPlatformStaff(req, res, next) {
  try {
    const staff = await StaffAccount.find({}).select('email username status twoFactor lastLoginAt createdAt').sort({ createdAt: -1 }).lean();
    const staffIds = staff.map((account) => account._id);
    const assignments = await RoleAssignment.find({ staffId: { $in: staffIds } })
      .populate({ path: 'roleId', select: 'name displayName scopeType scopeId' })
      .lean();
    const assignmentsByStaffId = new Map();
    for (const assignment of assignments) {
      const key = String(assignment.staffId);
      const existing = assignmentsByStaffId.get(key) || [];
      existing.push(assignment);
      assignmentsByStaffId.set(key, existing);
    }
    res.json({ staff: staff.map((account) => ({
      ...account,
      assignments: assignmentsByStaffId.get(String(account._id)) || [],
    })) });
  } catch (error) {
    next(error);
  }
}
