#!/bin/sh
#Netlify's build (netlify.toml). The siblings come from the commits in
#Siblings.txt, the fast tests must pass, the engine is compiled, the heavy
#files go to the CDN through _redirects, and only served files reach Site/.
set -e
cd "$(dirname "$0")/.."
rm -rf hemu holyc-fmt holycraft build Site _redirects
while read dir url sha; do
  git init -q $dir
  git -C $dir fetch -q --depth 1 $url $sha
  git -C $dir checkout -q FETCH_HEAD
done <Siblings.txt
while read dir url sha; do
  git init -q hemu/$dir
  git -C hemu/$dir fetch -q --depth 1 $url $sha
  git -C hemu/$dir checkout -q FETCH_HEAD
done <hemu/Siblings.txt
node Misc/AppsBuild.mjs
node Misc/Preload.mjs
sh Misc/Test.sh
node hemu/Kernel/Build.mjs hemu/build
node Misc/Cdn/OffloadRedirects.mjs
node Misc/Server.mjs Site
