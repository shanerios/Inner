#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

# Make sure npm's global bin is visible in this shell
PREFIX="$(npm config get prefix || true)"
if [ -n "$PREFIX" ] && [ -d "$PREFIX/bin" ]; then
  export PATH="$PREFIX/bin:$PATH"
fi

# Optional: choose a Metro port that your network won't fuss about
export RCT_METRO_PORT="${RCT_METRO_PORT:-8083}"

echo "🔧 Ensuring local @expo/ngrok is installed..."
if [ ! -d "node_modules/@expo/ngrok" ]; then
  npm i -D @expo/ngrok@^4.1.0
fi

echo "🚇 Starting Expo (tunnel mode, clear cache)…"
npx expo start --tunnel -c || {
  echo "❗Tunnel failed. Falling back to LAN..."
  npx expo start -c
}
