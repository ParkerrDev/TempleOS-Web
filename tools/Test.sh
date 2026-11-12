#!/bin/sh
#The fast tests, which need only node (22.15 or later, for the Workers' fake
#runtime) and the repo; the deploy runs them. chat-worker.test.mjs needs
#wrangler and stays a local check.
set -e
cd "$(dirname "$0")/.."
for t in tools/*.test.mjs; do
  if [ $t != tools/chat-worker.test.mjs ]; then
    node $t
  fi
done
for t in presence/Room.test.mjs chat/ChatRoom.test.mjs cdn/Files.test.mjs; do
  node $t
done
node tools/verify-games.mjs
node tools/toom/Package.mjs
node tools/hemu/stock-segments.mjs
node tools/native-games-audit.mjs --check
node search/Query.test.mjs
node search/QueryMemory.test.mjs
node sprites/Gr.test.mjs
node tools/games/evidence.test.mjs
node tools/games/startup.test.mjs
