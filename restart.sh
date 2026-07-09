#!/bin/bash

echo "🔄 Riavvio HITRACE60..."

PID=$(lsof -ti:3000)

if [ -n "$PID" ]; then
  echo "🛑 Chiudo Next.js PID: $PID"
  kill -9 $PID
else
  echo "ℹ️ Nessun processo sulla porta 3000"
fi

echo "🧹 Pulisco .next..."
rm -rf .next

echo "🚀 Avvio Next.js..."
npx pnpm exec next dev -H 0.0.0.0 -p 3000
