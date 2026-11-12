import mongoose from 'mongoose';
import { registerTenantIndexes } from '../tenancy/indexRegistry.js';
import { defineTenantModel } from '../tenancy/models.js';

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: false, index: true, immutable: true },
  roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatRoom', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  message: { type: String, required: true, maxlength: 2000 },
  
  // Message type
  type: { type: String, enum: ['text', 'system', 'rain', 'tip', 'image', 'sticker'], default: 'text' },
  
  // Metadata
  metadata: {
    rainId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatRain' },
    tipId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatTip' },
    replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatMessage' },
    mentionedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  
  // Moderation
  isDeleted: { type: Boolean, default: false },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  deletedAt: { type: Date },
  deleteReason: { type: String },
  
  // Edit history
  isEdited: { type: Boolean, default: false },
  editedAt: { type: Date },
  originalMessage: { type: String },
}, { timestamps: true });

schema.index({ roomId: 1, createdAt: -1 });
schema.index({ userId: 1, createdAt: -1 });
schema.index({ isDeleted: 1 });

registerTenantIndexes('ChatMessage', [
  { keys: { tenantId: 1, roomId: 1, createdAt: -1 }, options: { name: 'tenant_roomId_createdAt' } },
  { keys: { tenantId: 1, userId: 1, createdAt: -1 }, options: { name: 'tenant_userId_createdAt' } },
]);

export default defineTenantModel('ChatMessage', schema);
