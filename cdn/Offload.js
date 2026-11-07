//What templeosweb-files serves (Files.js), by repo: files, and folders that
//end in "/". tools/offload-redirects.mjs sends the same paths there, in this
//order, from this repo and from the HEMU clone beside the build.
export const OFFLOAD={
  "TempleOS-Web":[
	"vendor/images/templeos-hd.qcow2.gz",
	"vendor/ffmpeg/core/ffmpeg-core.wasm",
	"assets/terry-sprites.gr.gz",
	"assets/transcripts/",
	"games/upstream/"],
  HEMU:["live.bin.gz","live-smp.bin.gz"]
};
