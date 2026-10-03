#!/bin/bash
# DB Backup Script — Phase C6
# Günlük çalıştırılır (cron/systemd timer örneği: docs/RUNBOOK.md "Yedekleme Zamanlaması").
# Çıktı: yerel BACKUP_DIR + (opsiyonel) rclone uzak hedefi BACKUP_BUCKET.
#
# Saklama süresi:
#   RETENTION_DAYS         yerel yedekler            (varsayılan 30)
#   REMOTE_RETENTION_DAYS  uzak (BACKUP_BUCKET)      (varsayılan 90)
#   DİKKAT: uzak temizlik BACKUP_BUCKET altındaki 90 günden eski TÜM dosyaları
#   siler — bu yolu yalnız yedekler için ayırın. İlk kullanımda --dry-run deneyin.
#
# Kuru çalıştırma:  ./backup-db.sh --dry-run   (veya DRY_RUN=1)
#   Yedek ALMAZ, yüklemez; yalnız hangi eski yedeklerin silineceğini listeler.

set -e

DRY_RUN="${DRY_RUN:-0}"
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
    *) echo "Bilinmeyen argüman: $arg"; exit 2 ;;
  esac
done

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
REMOTE_RETENTION_DAYS="${REMOTE_RETENTION_DAYS:-90}"
DATE=$(date +%Y%m%d-%H%M%S)
BUCKET="${BACKUP_BUCKET:-}"

for v in RETENTION_DAYS REMOTE_RETENTION_DAYS; do
  case "${!v}" in
    ''|*[!0-9]*) echo "❌ $v sayı olmalı: '${!v}'"; exit 2 ;;
  esac
done

mkdir -p "$BACKUP_DIR"

if [ "$DRY_RUN" = "1" ]; then
  echo "🔎 KURU ÇALIŞTIRMA — yedek alınmayacak, hiçbir şey silinmeyecek"
else
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
fi

# Eski yerel backupları temizle (yalnız BACKUP_DIR'in doğrudan alt klasörleri)
echo "🧹 Eski yerel backuplar (>${RETENTION_DAYS} gün)..."
if [ "$DRY_RUN" = "1" ]; then
  find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name "20*" -mtime +"$RETENTION_DAYS" -print | sed 's/^/  silinecekti: /'
else
  find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name "20*" -mtime +"$RETENTION_DAYS" -exec rm -rf {} + 2>/dev/null || true
fi

# Eski uzak backupları temizle (REMOTE_RETENTION_DAYS) — yalnız BACKUP_BUCKET tanımlı ve rclone varsa
if [ -n "$BUCKET" ]; then
  if command -v rclone >/dev/null 2>&1; then
    echo "🧹 Eski uzak backuplar (>${REMOTE_RETENTION_DAYS} gün): $BUCKET"
    if [ "$DRY_RUN" = "1" ]; then
      rclone delete "$BUCKET" --min-age "${REMOTE_RETENTION_DAYS}d" --dry-run -v 2>&1 | tail -20 || true
    else
      # Başarısız temizlik yedeğin kendisini başarısız saymasın
      rclone delete "$BUCKET" --min-age "${REMOTE_RETENTION_DAYS}d" 2>&1 | tail -5 || echo "⚠️  uzak temizlik başarısız"
      rclone rmdirs "$BUCKET" --leave-root 2>&1 | tail -3 || true
    fi
  else
    echo "⚠️  BACKUP_BUCKET tanımlı ama rclone yok — uzak saklama (${REMOTE_RETENTION_DAYS} gün) uygulanamadı"
  fi
fi

REMAINING=$(find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name "20*" | wc -l)
echo "✅ Kalan yerel backup sayısı: $REMAINING"
if [ "$DRY_RUN" = "1" ]; then
  echo "🔎 Kuru çalıştırma bitti"
else
  echo "🎉 Backup tamamlandı: $DATE (${BACKUP_SIZE})"
fi
