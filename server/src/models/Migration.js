import mongoose from 'mongoose';

/**
 * K4 — Uygulanmış migration kayıtları. `name` benzersizdir; koşucu
 * idempotensi için bu koleksiyona bakar.
 */
const migrationSchema = new mongoose.Schema({
  name:      { type: String, required: true, unique: true, index: true },
  version:   { type: String, required: true },
  appliedAt: { type: Date, default: Date.now },
  // Resumable migrations store per-collection checkpoints: { [collName]: { lastId, processed, status } }.
  progress:  { type: mongoose.Schema.Types.Mixed, default: {} },
});

export default mongoose.model('Migration', migrationSchema);
