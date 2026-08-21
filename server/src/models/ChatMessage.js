import mongoose from 'mongoose';

const schema = new mongoose.Schema({
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

export default mongoose.model('ChatMessage', schema);