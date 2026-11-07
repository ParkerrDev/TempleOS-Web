#!/bin/sh
#The fast tests, which need only node and the repo; the deploy runs them.
#chat-worker.test.mjs needs wrangler and stays a local check.
set -e
cd "$(dirname "$0")/.."
for t in tools/*.test.mjs; do
  if [ $t != tools/chat-worker.test.mjs ]; then
    node $t
  fi
done
node tools/verify-games.mjs
