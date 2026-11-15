import {readFileSync,writeFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";

export function VideoListMk()
{
  let base=new URL("Transcripts/",import.meta.url),
    manifest=JSON.parse(readFileSync(new URL("manifest.json",base))),videos=[];
  for (let shard of manifest.shards)
    for (let {s,...video} of JSON.parse(gunzipSync(readFileSync(new URL(shard.f,base)))))
      videos.push(video);
  videos.sort(function (a,b) {return a.f.localeCompare(b.f);});
  return JSON.stringify(videos)+"\n";
}

export function VideoListWrite()
{
  writeFileSync(new URL("Videos.json",import.meta.url),VideoListMk());
}

if (import.meta.main) VideoListWrite();
