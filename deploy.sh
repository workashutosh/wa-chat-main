#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER="root@103.215.74.222"
APP_DIR="/var/www/wa_chat.nexusbizsol.com"
SSH="sshpass -p Wi3qgEz847 ssh -o StrictHostKeyChecking=no $SERVER"
RSYNC="sshpass -p Wi3qgEz847 rsync -az --delete"

echo "▶ Building frontend..."
cd "$SCRIPT_DIR/frontend" && npm run build && cd "$SCRIPT_DIR"

echo "▶ Stopping app (protects SQLite WAL)..."
$SSH "pm2 stop wa-chat-app"

echo "▶ Syncing backend..."
$RSYNC \
  --exclude 'node_modules' \
  --exclude 'data.sqlite*' \
  --exclude '.env' \
  "$SCRIPT_DIR/backend/" $SERVER:$APP_DIR/backend/

echo "▶ Syncing frontend..."
$RSYNC "$SCRIPT_DIR/frontend/dist/" $SERVER:$APP_DIR/frontend/

echo "▶ Installing deps & starting..."
$SSH "cd $APP_DIR/backend && npm install --omit=dev && pm2 start wa-chat-app && pm2 save"

echo "✅ Deploy complete!"
