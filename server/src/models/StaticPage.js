import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  slug: { type: String, required: true, unique: true, lowercase: true },
  category: { type: String, enum: ['company', 'legal'], required: true },
  route: { type: String, required: true }, // '/about', '/legal/terms' — public route, admin'de değiştirilmez
  title: { type: String, required: true },
  intro: { type: String, default: '' },
  sections: [{
    title: { type: String, required: true },
    content: { type: [String], default: [] },
  }],
  isEnabled: { type: Boolean, default: true },
  footerColumn: { type: String, enum: ['brand', 'support', 'legal'], required: true },
  footerOrder: { type: Number, default: 0 },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

schema.index({ footerColumn: 1, footerOrder: 1 });

export default mongoose.model('StaticPage', schema);
