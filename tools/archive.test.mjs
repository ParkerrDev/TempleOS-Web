import assert from "node:assert/strict";
import {ArchiveDetails,ArchiveFile,ArchiveWatch,ArchiveRange} from "../Archive.js";
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
console.log("Archive links: encoded filenames, timestamps and player routes pass.");

assert.equal(new URL(ArchiveRange(file)).pathname,
  "/archive/TerryADavis_TempleOS_Archive/"+file.split("/").map(encodeURIComponent).join("/"));
