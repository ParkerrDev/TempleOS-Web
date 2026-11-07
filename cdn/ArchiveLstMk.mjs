//Writes ArchiveLst.json, what the archive route in Files.js serves: the
//videos Terry Search's index (assets/transcripts) lists, by item, each path
//encoded a segment at a time as the page's links are. Run it whenever the
//index is rebuilt:
//  node cdn/ArchiveLstMk.mjs
import {readFileSync,writeFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";

const DIR=new URL("../assets/transcripts/",import.meta.url);

function PathEnc(path)
{
  return path.split("/").map(encodeURIComponent).join("/");
}

export function ArchiveLstMk()
{//The text of ArchiveLst.json.
  let shard,video,paths=new Set(),
	man=JSON.parse(readFileSync(new URL("manifest.json",DIR)));
  for (shard of man.shards)
    for (video of JSON.parse(gunzipSync(readFileSync(new URL(shard.f,DIR)))))
      paths.add(PathEnc(video.f));
  return JSON.stringify({[encodeURIComponent(man.archive)]:[...paths].sort()},
	null,1)+"\n";
}

if (import.meta.main)
  writeFileSync(new URL("ArchiveLst.json",import.meta.url),ArchiveLstMk());
