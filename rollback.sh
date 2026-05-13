#!/bin/bash
# Professional Rollback Script
# This script reverts the app to the previous Git commit and restarts the server.

echo "⚠️  Starting emergency rollback..."

# 1. Take a safety backup of the DB before we touch anything
if [ -f "./backup_db.sh" ]; then
    echo "📦 Taking safety backup of current database..."
    ./backup_db.sh
else
    echo "⚠️  Warning: backup_db.sh not found, skipping pre-rollback backup."
fi

# 2. Revert Git to the previous commit
echo "🔄 Reverting code to the previous commit (HEAD~1)..."
git reset --hard HEAD~1

# 3. Restart the server
echo "🚀 Restarting containers with the older code..."
docker-compose down
docker-compose up -d --build

# 4. Final verification
echo "🔍 Verifying app health..."
sleep 5
HEALTH_STATUS=$(curl -s http://localhost:8000/api/health | grep -o '"status":"online"')

if [ "$HEALTH_STATUS" == '"status":"online"' ]; then
    echo "✅ ROLLBACK SUCCESSFUL! App is back online."
else
    echo "❌ ERROR: App is still unhealthy after rollback. Check 'docker-compose logs'."
fi
