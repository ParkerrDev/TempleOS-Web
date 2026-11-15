import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {VideoListMk,VideoCopies} from "./VideoListMk.mjs";
import {ArchivePlayable} from "./Archive.js";
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

for (const video of videos.filter(v=>v.a)) {
  const copy=videos.find(v=>v.f==video.a);
  assert(!ArchivePlayable(video) && ArchivePlayable(copy));
  assert(Math.abs(video.n-copy.n)<=2);
}
const copies=VideoCopies([
  {f:"original (abcdefghijk).mkv",n:300,s:[[0,"Original recording"]]},
  {f:"copy (abcdefghijk).mp4",n:300,s:[[0,"Original recording"]]},
  {f:"cut (abcdefghijk).mkv",n:100,s:[[0,"Short cut"]]},
  {f:"Same title.mkv",n:300,s:[[0,"Unrelated recording"]]},
  {f:"Same title.mp4",n:300,s:[[0,"Different recording"]]}
]);
assert.equal(copies[0].a,copies[1].f);
assert(!copies[2].a,"A shorter cut must not seek into a full-length copy");
assert(!copies[3].a,"A shared title and length do not establish a duplicate");
console.log("Playable copies: matching source IDs/durations, no title-only or shortened-video substitutions.");
