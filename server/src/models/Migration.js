import mongoose from 'mongoose';

/**
 * K4 — Uygulanmış migration kayıtları. `name` benzersizdir; koşucu
 * idempotensi için bu koleksiyona bakar.
 */
const migrationSchema = new mongoose.Schema({
  name:      { type: String, required: true, unique: true, index: true },
  version:   { type: String, required: true },
  appliedAt: { type: Date, default: Date.now },
});

export default mongoose.model('Migration', migrationSchema);
