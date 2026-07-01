#!/bin/bash
# DB Restore Drill — backup doğrulama için
# Phase C6

set -e

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TARGET_DB="${TARGET_DB:-bet_restore_test}"
BACKUP_PATH="${1:-}"

if [ -z "$BACKUP_PATH" ]; then
  echo "Usage: $0 <backup-path>"
  echo "Available backups:"
  ls -1 "$BACKUP_DIR" 2>/dev/null | head -10
  exit 1
fi

if [ ! -d "$BACKUP_DIR/$BACKUP_PATH" ]; then
  echo "❌ Backup bulunamadı: $BACKUP_DIR/$BACKUP_PATH"
  exit 1
fi

echo "🔍 Restore test başlıyor: $BACKUP_PATH → $TARGET_DB"

# Geçici DB'ye restore
mongorestore --uri="$MONGODB_URI/$TARGET_DB" --gzip --drop "$BACKUP_DIR/$BACKUP_PATH" 2>&1 | tail -10

# Doğrulama
echo "✅ Restore tamamlandı. Kontrol: mongosh \"$MONGODB_URI/$TARGET_DB\" --eval 'db.getCollectionNames()'"

# Cleanup reminder
echo "🧹 Test DB'yi silmek için:"
echo "   mongosh \"$MONGODB_URI/$TARGET_DB\" --eval 'db.dropDatabase()'"