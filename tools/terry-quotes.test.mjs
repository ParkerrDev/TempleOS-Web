import assert from "node:assert/strict";
import {readFileSync,readdirSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {TERRY_QUOTES} from "../TerryQuotes.js";
import {ArchiveDetails,ArchiveFile,ArchiveWatch} from "../Archive.js";

const dir=new URL("../assets/transcripts/",import.meta.url),videos=new Map();
for (const file of readdirSync(dir).filter(name=>/^shard-.*\.gz$/.test(name)))
  for (const video of JSON.parse(gunzipSync(readFileSync(new URL(file,dir)))))
    if (TERRY_QUOTES.some(quote=>quote.f==video.f))
      videos.set(video.f,video);
for (const quote of TERRY_QUOTES) {
  const video=videos.get(quote.f);
  assert(video,"quote has a source video in the archive");
  assert.equal(video.d,quote.d);
  assert(video.s.some(([sec,text])=>sec==quote.sec && text==quote.text),
    "the excerpt and timestamp are exactly the archived transcript");
}
const file="videos/2017/2017-03-08T00:00:00+00:00 - a & b.mp4";
assert.equal(ArchiveFile(file),"https://archive.org/download/"+
  "TerryADavis_TempleOS_Archive/videos/2017/2017-03-08T00%3A00%3A00%2B00%3A00%20-%20a%20%26%20b.mp4");
assert.equal(ArchiveDetails(file,90),"https://archive.org/details/"+
  "TerryADavis_TempleOS_Archive/videos/2017/2017-03-08T00%3A00%3A00%252B00%3A00+-+a+%26+b.mp4?start=90");
const url=new URL(ArchiveWatch({f:file,t:"A & B",p:0},90,"https://example.com/"));
assert.equal(url.pathname,"/player.html");
assert.equal(url.searchParams.get("f"),file);
assert.equal(url.searchParams.get("n"),"A & B");
assert.equal(url.searchParams.get("t"),"90");
console.log("Terry quotes: transcript provenance and timestamped archive links passed.");
