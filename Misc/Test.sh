#!/bin/sh
#The fast tests, which need only node (22.15 or later, for the Workers' fake
#runtime) and the repo; the deploy runs them. A fast test sits beside what it
#tests. A Test folder holds a suite with a runner of its own.
#ChatWorker.test.mjs needs wrangler and Play.test.mjs needs python3: they
#stay local checks.
set -e
cd "$(dirname "$0")/.."
for t in $(git ls-files '*.test.mjs'); do
  case $t in
    */Test/*|Apps/Chat/ChatWorker.test.mjs|Apps/Sprites/Play.test.mjs) ;;
    *) if [ -f "$t" ]; then node $t; fi ;;
  esac
done
node Demo/Games/GamesVerify.mjs
node Demo/Games/Toom/Test/Package.mjs
node Demo/Games/NativeGamesAudit.mjs --check
node Demo/Games/Test/Evidence.test.mjs
node Demo/Games/Test/Startup.test.mjs
