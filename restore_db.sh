#!/bin/bash
# This script restores the database from a backup .sql file

if [ -z "$1" ]; then
  echo "⚠️ Error: You must provide a backup file to restore from."
  echo "👉 Usage: ./restore_db.sh <backup_file.sql>"
  exit 1
fi

echo "⚠️ WARNING: This will OVERWRITE your current database with the data from $1."
read -p "Are you absolutely sure you want to proceed? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]
then
    echo "🔄 Restoring database..."
    cat "$1" | docker exec -i app_db_1 psql -U postgres -d telegram_translator
    echo "✅ Restore complete! Your data is back."
else
    echo "❌ Restore cancelled."
fi
