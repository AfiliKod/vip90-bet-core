#!/bin/bash
# DB Backup Script — Phase C6
# Render cron job: günlük 03:00 UTC
# Çıktı: S3/R2 bucket veya yerel backups/ dizini (90 gün retention)

set -e

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
DATE=$(date +%Y%m%d-%H%M%S)
BUCKET="${BACKUP_BUCKET:-}"

mkdir -p "$BACKUP_DIR"

echo "📦 MongoDB backup başlıyor: $DATE"

# Dump
if [ -n "$MONGODB_URI" ]; then
  mongodump --uri="$MONGODB_URI" --out="$BACKUP_DIR/$DATE" --gzip 2>&1 | tail -5
else
  echo "❌ MONGODB_URI tanımlı değil"
  exit 1
fi

# Boyut kontrol
BACKUP_SIZE=$(du -sh "$BACKUP_DIR/$DATE" | cut -f1)
echo "✅ Backup tamamlandı: $BACKUP_SIZE"

# R2/S3 upload (opsiyonel)
if [ -n "$BUCKET" ] && command -v rclone >/dev/null 2>&1; then
  echo "☁️  R2/S3 upload başlıyor..."
  rclone copy "$BACKUP_DIR/$DATE" "$BUCKET/$DATE/" 2>&1 | tail -3
  echo "✅ Upload tamamlandı"
fi

# Eski backupları temizle
echo "🧹 Eski backuplar temizleniyor (>${RETENTION_DAYS} gün)..."
find "$BACKUP_DIR" -type d -name "20*" -mtime +$RETENTION_DAYS -exec rm -rf {} + 2>/dev/null || true

REMAINING=$(find "$BACKUP_DIR" -type d -name "20*" | wc -l)
echo "✅ Kalan backup sayısı: $REMAINING"
echo "🎉 Backup tamamlandı: $DATE ($BACKUP_SIZE)"