import mongoose from 'mongoose';

// Platform collection (İP-10a, spec §7.1): one row per 15-minute measurement
// window per process. Never tenantScoped — capacity belongs to the install.
const capacityWindowSchema = new mongoose.Schema({
  windowStart: { type: Date, required: true },
  host: { type: String, required: true },
  pid: { type: Number, required: true },
  socketsP95: { type: Number, required: true },
  eventLoopP99Ms: { type: Number, required: true },
  cpuPct: { type: Number, required: true },
}, { timestamps: true });

capacityWindowSchema.index({ windowStart: -1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export default mongoose.models.CapacityWindow
  || mongoose.model('CapacityWindow', capacityWindowSchema);