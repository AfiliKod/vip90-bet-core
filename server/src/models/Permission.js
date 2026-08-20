import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  // Permission key (e.g., 'admin:users:read', 'admin:settings:write')
  key: { type: String, required: true, unique: true },
  // Human-readable name
  name: { type: String, required: true },
  // Description
  description: { type: String, default: '' },
  // Category for grouping (e.g., 'users', 'settings', 'reports', 'casino')
  category: { type: String, required: true },
}, { timestamps: true });

export default mongoose.model('Permission', schema);