import mongoose from 'mongoose';

/**
 * Çalışma anında admin panelinden değiştirilebilen ayarlar. Şu an yalnızca alarm
 * kanalı anahtarlarını tutar; `.env` dosyasına SSH ile dokunmadan alarm hattının
 * konfigüre edilebilmesi için var.
 */
const settingSchema = new mongoose.Schema({
  key:       { type: String, required: true, unique: true, index: true },
  value:     { type: String, default: '' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

export default mongoose.model('Setting', settingSchema);
