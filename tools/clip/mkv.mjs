import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {MkvClip} from "../../clip/Mkv.js";
import {ClipProgram} from "../../clip/Program.js";

const root=new URL("../../",import.meta.url),dir=new URL("tmp/clip/",root);
await mkdir(dir,{recursive:true});
function Ffmpeg(args)
{
  return execFileSync("ffmpeg",["-hide_banner","-loglevel","error","-y",...args],
    {cwd:dir,maxBuffer:64*1024*1024});
}
function Probe(file)
{
  return JSON.parse(execFileSync("ffprobe",["-v","error","-show_packets",
    "-show_streams","-show_format","-show_data_hash","sha256","-of","json",file],
    {cwd:dir,maxBuffer:16*1024*1024}));
}
function Frames(file)
{
  return Ffmpeg(["-i",file,"-map","0:v:0","-f","framemd5","-"]).toString().
    split("\n").filter(s=>s && !s.startsWith("#")).map(s=>s.split(",").at(-1).trim());
}
globalThis.fetch=async function (url) {return new Response(await readFile(url));};
Ffmpeg(["-i","source.mp4","-map","0","-c","copy","source.mkv"]);
Ffmpeg(["-i","source.mp4","-map","0","-c","copy","-cluster_time_limit",
  "1300","source-split.mkv"]);
Ffmpeg(["-f","lavfi","-i","testsrc2=size=160x120:rate=25",
  "-f","lavfi","-i","sine=frequency=750:sample_rate=48000","-t","12",
  "-c:v","libvpx-vp9","-deadline","realtime","-cpu-used","8","-g","50",
  "-c:a","libopus","source.webm"]);
const results=[];
for (const name of ["source.mkv","source-split.mkv","source.webm"]) {
  const source=await readFile(new URL(name,dir)),probe=Probe(name),
    frames=Frames(name),duration=Number(probe.format.duration);
  for (const [start,end] of [[0,1.4],[2,3.2],[7.15,10.65],[9.99,10.03],
      [duration-0.8,duration]]) {
    let read=0,requests=0;
    const result=await MkvClip({total:source.length,async Read(pos,size) {
      assert(pos>=0 && pos<source.length && size>0 && size<=16777216);
      requests++;const bytes=source.subarray(pos,pos+size);read+=bytes.length;
      return bytes;
    }},start,end),out=name.replace("source","mkv-cut");
    await writeFile(new URL(out,dir),new Uint8Array(result.buf));
    if (start==7.15)
      await writeFile(new URL(name.replace("source","mkv-verified"),dir),new Uint8Array(result.buf));
    const cut=Probe(out);
    assert(result.start<=start+0.002,"Start snaps outward to an indexed keyframe.");
    assert(result.end>=Math.min(end,duration)-0.002,"End includes the requested range.");
    assert(Math.abs(Number(cut.format.duration)-(result.end-result.start))<0.002);
    for (const stream of probe.streams) {
      const original=probe.packets.filter(p=>p.stream_index==stream.index),
        copied=cut.packets.filter(p=>p.stream_index==stream.index),
        first=original.findIndex(p=>p.data_hash==copied[0].data_hash &&
          Math.abs(Number(p.pts_time)-Number(copied[0].pts_time)-result.start)<0.002);
      assert(first>=0);
      assert.deepEqual(copied.map(p=>p.data_hash),original.slice(first,first+copied.length).
        map(p=>p.data_hash),"Packets are an unchanged contiguous subsequence.");
      for (let i=0;i<copied.length;i++)
        assert(Math.abs(Number(copied[i].pts_time)+result.start-
          Number(original[first+i].pts_time))<0.002,"Packet presentation times keep A/V sync.");
    }
    const decoded=Frames(out),first=frames.indexOf(decoded[0]);
    assert(first>=0);
    assert.deepEqual(decoded,frames.slice(first,first+decoded.length),
      "Every decoded picture matches the original at this boundary.");
    Ffmpeg(["-xerror","-i",out,"-f","null","-"]);
    results.push({file:name,requested:[start,end],actual:[result.start,result.end],
      originalBytes:source.length,outputBytes:result.buf.byteLength,read,requests});
  }
  const damaged=Buffer.from(source);damaged[0]=0;
  await assert.rejects(()=>MkvClip({total:damaged.length,
    async Read(pos,size) {return damaged.subarray(pos,pos+size);}},1,2),/EBML/);
}
await writeFile(new URL("mkv-check.json",dir),JSON.stringify(results,null,2)+"\n");
const parser=await ClipProgram("Mkv.HC",["MkLace","MkError","MkReset"],"MkError");
for (const [flags,header,payload,count] of [
  [2,[2,255,255,255,35,255,245],2300,3],
  [6,[2,0x43,0x20,0x5e,0xd3],2300,3],
  [4,[2],300,3],
  [2,[1,255],0,null],[4,[2],301,null],[6,[2,0x43],0,null],
  [6,[2,0x81,0x80],10,null],[2,[0],20,null]
]) {
  parser.Call("MkReset");
  const bytes=new Uint8Array(header.length+payload);bytes.set(header);
  const ptr=parser.Put(bytes),read=()=>parser.Call("MkLace",ptr,ptr+BigInt(bytes.length),BigInt(flags));
  if (count===null) assert.throws(read,/lace|EBML/i);
  else assert.equal(read(),BigInt(count));
}
console.log("Matroska/WebM: fifteen indexed cuts preserve packet hashes, presentation times and decoded pictures.");
console.log("Xiph, EBML and fixed laces accept the specified sizes and reject truncated or inconsistent data.");
