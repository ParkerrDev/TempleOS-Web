//Archive.org's /cors/ endpoint allows reads but ignores byte ranges.
const CORSBASE="https://archive.org/cors/TerryADavis_TempleOS_Archive/",
  CONVERT_LOCK="terry-convert-"+crypto.randomUUID();

export async function convertVideo({f,start=0,win=600,onStatus=function () {},
    signal=new AbortController().signal})
{
  signal.throwIfAborted();
  const {FFmpeg}=await import("./FFmpeg/ffmpeg/index.js");
  signal.throwIfAborted();
  onStatus("Waiting for converter…");
  return navigator.locks.request(CONVERT_LOCK,{signal},async function () {
    let ff=new FFmpeg(),reader=null,parts=[],got=0,at=0,all,out,result,
      full=false,ext=f.split(".").pop().toLowerCase();
    function Cancel()
    {
      ff.terminate();
    }
    function Progress({time})
    {
      onStatus("Converting… "+Math.min(100,Math.round((time || 0)/1e6*100/win))+"%");
    }
    signal.addEventListener("abort",Cancel,{once:true});
    try {
      onStatus("Loading converter…");
      await ff.load({coreURL:new URL("./FFmpeg/core/ffmpeg-core.js",import.meta.url).href,
	wasmURL:new URL("./FFmpeg/core/ffmpeg-core.wasm",import.meta.url).href});
      signal.throwIfAborted();
      let response=await fetch(CORSBASE+f.split("/").map(encodeURIComponent).join("/"),{signal}),
	total=Number(response.headers.get("content-length")) || 0;
      if (!response.ok || total>400e6) {
	await response.body?.cancel();
	if (!response.ok) throw new Error("Archive.org fetch failed ("+response.status+").");
	throw new Error("File exceeds the 400 MB conversion limit.");
      }
      reader=response.body.getReader();
      while (true) {
	let {done,value}=await reader.read();
	if (done) break;
	got+=value.length;
	if (got>400e6) throw new Error("File exceeds the 400 MB conversion limit.");
	parts.push(value);
	onStatus("Downloading video… "+(got/1e6).toFixed(1)+" MB");
      }
      all=new Uint8Array(got);
      for (let part of parts) {all.set(part,at);at+=part.length;}
      parts=[];
      await ff.writeFile("in",all);
      ff.on("progress",Progress);
      if ((ext=="mkv" || ext=="mov") && !start) {
	onStatus("Remuxing without re-encoding…");
	full=await ff.exec(["-i","in","-c","copy","-movflags","faststart","out.mp4"])==0;
      }
      if (!full) {
	onStatus("Converting… 0%");
	result=await ff.exec(["-ss",String(start),"-i","in","-t",String(win),
	  "-vf","scale=-2:480","-c:v","libx264","-preset","ultrafast","-crf","28",
	  "-c:a","aac","-b:a","96k","-movflags","faststart","out.mp4"]);
	if (result) throw new Error("Conversion failed (ffmpeg rc "+result+").");
      }
      out=await ff.readFile("out.mp4");signal.throwIfAborted();onStatus("");
      return {blobUrl:URL.createObjectURL(new Blob([out.buffer],{type:"video/mp4"})),
	windowed:!full,start,win};
    } catch (error) {
      signal.throwIfAborted();throw error;
    } finally {
      signal.removeEventListener("abort",Cancel);
      ff.terminate();
      if (reader) await reader.cancel().catch(function () {});
    }
  });
}
