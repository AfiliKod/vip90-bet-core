import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  // Role name (e.g., 'super_admin', 'support', 'finance', 'casino_manager')
  name: { type: String, required: true, unique: true },
  // Display name
  displayName: { type: String, required: true },
  // Description
  description: { type: String, default: '' },
  // Permissions assigned to this role
  permissions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Permission' }],
  // Is this a system role (cannot be deleted)
  isSystem: { type: Boolean, default: false },
  // Priority for inheritance (higher = more permissions)
  priority: { type: Number, default: 0 },
}, { timestamps: true });

export default mongoose.model('Role', schema);