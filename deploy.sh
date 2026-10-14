#!/usr/bin/env bash
set -e

SERVER="root@103.215.74.222"
APP_DIR="/var/www/wa-chat"
SSHPASS="sshpass -p 'Wi3qgEz847'"

echo "▶ Building frontend..."
cd frontend && npm run build && cd ..

echo "▶ Syncing files to server..."
# Backend source
rsync -az --delete \
  --exclude 'node_modules' \
  --exclude 'data.sqlite' \
  --exclude '.env' \
  backend/ $SERVER:$APP_DIR/backend/

# Frontend build
rsync -az --delete \
  frontend/dist/ $SERVER:$APP_DIR/frontend/dist/

echo "▶ Installing backend deps on server..."
ssh $SERVER "cd $APP_DIR/backend && npm install --omit=dev"

echo "▶ Restarting PM2..."
ssh $SERVER "pm2 describe wa-chat > /dev/null 2>&1 \
  && pm2 restart wa-chat \
  || pm2 start $APP_DIR/backend/src/server.js --name wa-chat && pm2 save"

echo "✅ Deploy complete!"
