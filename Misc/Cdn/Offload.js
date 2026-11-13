//What templeosweb-files serves (Files.js), by repo: files, and folders that
//end in "/". Misc/Cdn/OffloadRedirects.mjs sends the same paths there, in this
//order, from this repo and from the HEMU clone beside the build.
export const OFFLOAD={
  "TempleOS-Web":[
	"vendor/images/templeos-hd.qcow2.gz",//stays here until HEMU holds the disk
	"Apps/Search/FFmpeg/core/ffmpeg-core.wasm",
	"Apps/Terry/TerrySprites.gr.gz",
	"Apps/Search/Transcripts/",
	"Demo/Games/Upstream/"],
  HEMU:["live.bin.gz","live-smp.bin.gz"]
};
