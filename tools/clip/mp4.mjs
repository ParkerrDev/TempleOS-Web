import assert from "node:assert/strict";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {execFileSync} from "node:child_process";
import {compileHolyC} from "../../holyc-wasm/src/compiler.js";
import {createHost} from "../../holyc-wasm/src/runtime/host.js";

const tmp=new URL("../../tmp/clip/",import.meta.url);
await mkdir(tmp,{recursive:true});
const input=new URL("source.mp4",tmp),output=new URL("cut.mp4",tmp);
execFileSync("ffmpeg",["-hide_banner","-loglevel","error","-y",
  "-f","lavfi","-i","testsrc2=size=160x120:rate=25",
  "-f","lavfi","-i","sine=frequency=440:sample_rate=48000",
  "-t","20","-c:v","libx264","-g","50","-bf","3","-c:a","aac",input.pathname]);
const bytes=await readFile(input),source=await readFile(new URL("../../clip/Mp4.HC",import.meta.url),"utf8"),
  names=["ClipPlan","ClipReadPos","ClipReadSize","ClipReadPut",
    "ClipResult","ClipResultSize","ClipError","ClipDel"],
  compiled=compileHolyC(source,{filename:"Mp4.HC",lenient:false,exports:names});
assert.deepEqual(compiled.warnings,[]);
const host=createHost({}),{instance}=await WebAssembly.instantiate(compiled.bytes,{env:host.env});
host.attach(instance);const fn=instance.exports;fn.__main();
function Put(bytes) {
  const ptr=host.env.__malloc(BigInt(bytes.length));
  new Uint8Array(fn.memory.buffer).set(bytes,Number(ptr));
  return ptr;
}
function ErrorText() {
  const p=Number(fn.ClipError()),mem=new Uint8Array(fn.memory.buffer);
  return new TextDecoder().decode(mem.subarray(p,mem.indexOf(0,p)));
}
let moov;
for (let pos=0;pos<bytes.length;) {
  const size=bytes.readUInt32BE(pos),tag=bytes.toString("ascii",pos+4,pos+8);
  if (tag=="moov") {moov=bytes.subarray(pos,pos+size);break;}
  pos+=size;
}
assert(moov);
function Cut(start,end,input_bytes=bytes,metadata=moov) {
  assert(fn.ClipPlan(Put(metadata),BigInt(metadata.length),BigInt(input_bytes.length),start,end),ErrorText());
  let read=0,cnt=0;
  for (;;) {
    const at=Number(fn.ClipReadPos());
    if (at<0) break;
    const size=Number(fn.ClipReadSize());
    fn.ClipReadPut(Put(input_bytes.subarray(at,at+size)),BigInt(size));
    read+=size;cnt++;
    assert(cnt<100,"range plan terminates");
  }
  const result=Buffer.from(new Uint8Array(fn.memory.buffer).subarray(Number(fn.ClipResult()),
    Number(fn.ClipResult()+fn.ClipResultSize())));
  return {result,read,cnt};
}
const {result,read,cnt}=Cut(7.15,10.65);
await writeFile(output,result);
const probe=JSON.parse(execFileSync("ffprobe",["-v","error","-show_format","-show_streams",
  "-of","json",output.pathname],{encoding:"utf8"}));
assert.equal(probe.streams.length,2);
assert.equal(Number(probe.format.duration),3.5);
execFileSync("ffmpeg",["-hide_banner","-v","error","-i",output.pathname,"-f","null","-"]);
console.log({compiled:compiled.bytes.length,input:bytes.length,output:result.length,read,cnt,
  duration:probe.format.duration,streams:probe.streams.map(s=>[s.codec_name,s.start_time,s.duration])});

function Decoded(path,start,end,kind) {
  const args=["-v","error","-i",path];
  if (start!=null) {
    if (kind=="video") args.push("-vf","select='gte(t,"+start+")*lt(t,"+end+")'");
    else args.push("-af","atrim=start="+start+":end="+end);
  }
  if (kind=="video") args.push("-an","-fps_mode","passthrough","-f","framemd5","-");
  else args.push("-vn","-f","s16le","-");
  const raw=execFileSync("ffmpeg",args,{maxBuffer:16*1024*1024});
  if (kind=="audio") return raw;
  return raw.toString().split("\n").filter(s=>s && !s.startsWith("#")).map(s=>s.split(",").at(-1).trim());
}
//AAC perceptual-noise synthesis has a decoder RNG, so packet preservation is
//the invariant. Disable PNS only in the independent PCM alignment fixture.
const pcm_input=new URL("pcm-oracle.mp4",tmp);
execFileSync("ffmpeg",["-hide_banner","-loglevel","error","-y",
  "-f","lavfi","-i","testsrc2=size=160x120:rate=25",
  "-f","lavfi","-i","sine=frequency=440:sample_rate=48000",
  "-t","20","-c:v","libx264","-g","50","-bf","3","-c:a","aac",
  "-aac_pns","0",pcm_input.pathname]);
const pcm_bytes=await readFile(pcm_input);
let pcm_moov;
for (let at=0;at<pcm_bytes.length;at+=pcm_bytes.readUInt32BE(at))
  if (pcm_bytes.toString("ascii",at+4,at+8)=="moov")
    pcm_moov=pcm_bytes.subarray(at,at+pcm_bytes.readUInt32BE(at));
function Packets(path) {
  return JSON.parse(execFileSync("ffprobe",["-v","error","-ignore_editlist","1",
    "-show_packets","-show_data_hash","sha256","-of","json",path],
    {encoding:"utf8",maxBuffer:8*1024*1024})).packets;
}
const original_packets=Packets(input.pathname),clipped_packets=Packets(output.pathname);
for (const track of [0,1]) {
  const original=original_packets.filter(p=>p.stream_index==track),
    clipped=clipped_packets.filter(p=>p.stream_index==track),
    first=original.findIndex(p=>p.data_hash==clipped[0].data_hash);
  assert(first>=0);
  assert.deepEqual(clipped.map(p=>[p.data_hash,p.duration]),
    original.slice(first,first+clipped.length).map(p=>[p.data_hash,p.duration]),
    "every encoded packet, including PNS audio, remains unchanged");
}
for (const [start,end] of [[0,0.04],[1.98,2.06],[2,4],[7.15,10.65],[9.99,10.03],[19.5,20]]) {
  const {result}=Cut(start,end,pcm_bytes,pcm_moov),file=new URL("check.mp4",tmp);
  await writeFile(file,result);
  for (const kind of ["video","audio"]) {
    const actual=Decoded(file.pathname,null,null,kind),
      expected=Decoded(pcm_input.pathname,start,end,kind);
    if (kind=="audio")
      assert(actual.equals(expected),"PCM bytes and alignment match at "+start+
        " ("+actual.length+" vs "+expected.length+" bytes)");
    else assert.deepEqual(actual,expected,"decoded frames match at "+start);
  }
}
console.log("MP4 packets preserved exactly; video and deterministic-audio alignment match six cuts.");

for (const damage of [
  b=>b.writeUInt32BE(b.length+1,0),
  b=>b.writeUInt32BE(0xFFFFFFFF,b.indexOf(Buffer.from("stts"))+8),
  b=>b.writeUInt32BE(0xFFFFFFFF,b.indexOf(Buffer.from("stsz"))+12),
  b=>b.writeUInt32BE(0,b.indexOf(Buffer.from("mdhd"))+16),
  b=>b.writeUInt32BE(bytes.length+1,b.indexOf(Buffer.from("stco"))+12),
]) {
  const bad=Buffer.from(moov);damage(bad);
  let accepted=false;
  try {accepted=!!fn.ClipPlan(Put(bad),BigInt(bad.length),BigInt(bytes.length),1,2);}
  catch (e) {if (!ErrorText()) throw e;}
  assert.equal(accepted,false,
    "malformed media must be rejected before reading or copying its samples");
  assert(ErrorText());
}
console.log("MP4 invalid sizes/counts/timescales/sample ranges rejected.");
