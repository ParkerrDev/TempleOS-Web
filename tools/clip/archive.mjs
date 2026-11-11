import {readFile,writeFile,mkdir} from "node:fs/promises";
import {execFileSync} from "node:child_process";
import {RangeSource} from "../../clip/Range.js";
import {Mp4Clip} from "../../clip/Mp4.js";

const files=JSON.parse(await readFile(new URL("../../cdn/ArchiveLst.json",import.meta.url))),
  item="TerryADavis_TempleOS_Archive",path=files[item].find(f=>f.includes("Songs%20by%20God%20%232%20") && f.endsWith(".mp4")),
  url="https://archive.org/download/"+item+"/"+path,
  requests=[],Fetch=globalThis.fetch;
globalThis.fetch=async function (url,options) {
  if (url instanceof URL && url.protocol=="file:")
    return new Response(await readFile(url));
  const response=await Fetch(url,options);
  requests.push({url:String(url),range:options?.headers?.Range,status:response.status,
    contentRange:response.headers.get("Content-Range"),etag:response.headers.get("ETag")});
  return response;
};
const source=RangeSource(url,console.log),start=performance.now(),
  result=await Mp4Clip(source,60,70),out=new URL("../../tmp/clip/archive-cut.mp4",import.meta.url);
await mkdir(new URL(".",out),{recursive:true});
await writeFile(out,new Uint8Array(result));
const probe=JSON.parse(execFileSync("ffprobe",["-v","error","-show_format","-show_streams",
  "-of","json",out.pathname],{encoding:"utf8"}));
execFileSync("ffmpeg",["-v","error","-i",out.pathname,"-f","null","-"]);
const evidence={source:url,originalBytes:source.total,outputBytes:result.byteLength,
  elapsed:performance.now()-start,requests,probe};
await writeFile(new URL("../../tmp/clip/archive-check.json",import.meta.url),JSON.stringify(evidence,null,2));
console.log({source:url,originalBytes:source.total,outputBytes:result.byteLength,
  duration:probe.format.duration,elapsed:evidence.elapsed});
