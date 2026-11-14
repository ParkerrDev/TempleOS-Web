#!/bin/sh
#Netlify's build (netlify.toml). The siblings come from the commits in
#Siblings.txt, the fast tests must pass, the engine is compiled, the heavy
#files go to the CDN through _redirects, and only served files reach Site/.
set -e
cd "$(dirname "$0")/.."
rm -rf holyc-wasm hemu holyc-fmt holycraft build Site _redirects
while read dir url sha; do
  git init -q $dir
  git -C $dir fetch -q --depth 1 $url $sha
  git -C $dir checkout -q FETCH_HEAD
done <Siblings.txt
sh Misc/Test.sh
node Kernel/Build.mjs build
node Misc/Cdn/OffloadRedirects.mjs
node Misc/Server.mjs Site
