import {readFileSync,writeFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {createHash} from "node:crypto";
import {ArchivePlayable} from "./Archive.js";

export function VideoCopies(videos)
{
  const groups=new Map(),keys=new Map();
  for (const video of videos) {
    const id=/\(([\w-]{11})\)/.exec(video.f),
      text=video.s.map(s=>s[1]).join(" ").toLowerCase().replace(/[^\p{L}\p{N}]+/gu," ").trim(),
      tags=[];
    if (id) tags.push("id:"+id[1]);
    if (text.length>500) tags.push("text:"+createHash("sha256").update(text).digest("hex"));
    keys.set(video,tags);
    for (const tag of tags) {
      if (!groups.has(tag)) groups.set(tag,[]);
      groups.get(tag).push(video);
    }
  }
  return videos.map(function ({s,...video},index) {
    if (!ArchivePlayable(video) && video.n>0) {
      const candidates=keys.get(videos[index]).flatMap(key=>groups.get(key)).filter(
        v=>ArchivePlayable(v) && v.n>0 && Math.abs(v.n-video.n)<=2);
      candidates.sort((a,b)=>Number(b.f.endsWith(".mp4"))-Number(a.f.endsWith(".mp4")) || a.f.localeCompare(b.f));
      if (candidates.length) video.a=candidates[0].f;
    }
    return video;
  });
}

export function VideoListMk()
{
  let base=new URL("Transcripts/",import.meta.url),
    manifest=JSON.parse(readFileSync(new URL("manifest.json",base))),videos=[];
  for (let shard of manifest.shards)
    for (let video of JSON.parse(gunzipSync(readFileSync(new URL(shard.f,base)))))
      videos.push(video);
  videos.sort(function (a,b) {return a.f.localeCompare(b.f);});
  return JSON.stringify(VideoCopies(videos))+"\n";
}

export function VideoListWrite()
{
  writeFileSync(new URL("Videos.json",import.meta.url),VideoListMk());
}

if (import.meta.main) VideoListWrite();
