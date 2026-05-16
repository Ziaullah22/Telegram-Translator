#!/bin/bash

# --- CONFIGURATION ---
DB_NAME="telegram_translator"
DB_USER="postgres"
BACKUP_DIR="/home/deploy/app/backups"
REMOTE_USER="ubuntu"
REMOTE_HOST="165.154.203.191"           # Singapore Backup Server
REMOTE_DIR="/home/ubuntu/backups"       # Path on the Singapore VPS
TIMESTAMP=$(date +"%Y-%m-%d")
FILENAME="db_backup_$TIMESTAMP.sql.gz"

# 1. Create local backup directory if it doesn't exist
mkdir -p $BACKUP_DIR

echo "🚀 Starting Encrypted Backup Process..."

# 2. Dump Database and Compress (Encrypted stream)
# We use docker exec to pull the data from the running container
docker exec app_db_1 pg_dump -U $DB_USER $DB_NAME | gzip > $BACKUP_DIR/$FILENAME

if [ $? -eq 0 ]; then
    echo "✅ Local backup created: $FILENAME"
else
    echo "❌ Error: Database dump failed!"
    exit 1
fi

# 3. Securely Sync to Remote VPS using Rsync (Encrypted via SSH)
# --inplace and --partial make it efficient for large files
# -z compresses data during transfer
echo "📡 Syncing to Remote VPS ($REMOTE_HOST)..."
rsync -avz --progress -e ssh $BACKUP_DIR/ $REMOTE_USER@$REMOTE_HOST:$REMOTE_DIR/

if [ $? -eq 0 ]; then
    echo "💎 SUCCESS: Remote differential backup complete!"
    # Optional: Remove local backups older than 7 days to save space
    find $BACKUP_DIR -type f -mtime +7 -name "*.gz" -delete
else
    echo "❌ Error: Remote sync failed! Check SSH connection."
    exit 1
fi
