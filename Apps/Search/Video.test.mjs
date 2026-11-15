import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {VideoListMk} from "./VideoListMk.mjs";
import {VideoRandom} from "./Video.js";

const catalog=readFileSync(new URL("Videos.json",import.meta.url),"utf8"),
  videos=JSON.parse(catalog),manifest=JSON.parse(readFileSync(
    new URL("Transcripts/manifest.json",import.meta.url)));
assert.equal(catalog,VideoListMk(),"Rebuild the catalog when transcripts change");
assert.equal(videos.length,manifest.videos);
assert(videos.every(function (video) {return !video.s && video.f && video.t;}));
for (let i=1;i<videos.length;i++)
  assert(videos[i-1].f<=videos[i].f,"Source timestamps determine chronological order");
const sample=[{f:"a"},{f:"b"},{f:"c"}],Random=Math.random;
try {
  for (const random of [0,0.49999,0.5,0.999999]) {
    Math.random=function () {return random;};
    for (const current of sample)
      assert.notEqual(VideoRandom(sample,current.f),current);
  }
  assert.equal(VideoRandom([sample[0]],"a"),sample[0]);
} finally {Math.random=Random;}
console.log("Video catalog: corpus completeness, timestamp order and random exclusion passed.");
