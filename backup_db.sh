#!/bin/bash
# This script creates a full backup of the PostgreSQL database

# Generate a filename with the current date and time
FILENAME="db_backup_$(date +%Y%m%d_%H%M%S).sql"

echo "📦 Starting backup of 'telegram_translator' database..."

# Run pg_dump inside the docker container and save it to a file on the VPS
docker exec -t app_db_1 pg_dump -U postgres -c --if-exists -d telegram_translator > $FILENAME

echo "✅ Backup successfully saved to: $FILENAME"
echo "💡 Tip: You can download this file using SFTP/FileZilla to keep it safe on your own computer."
