// Build genuine GR animation frames using the same palette mapper as Sprite Studio.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {quantize,encodeGR} from '../sprite-codec.js';
const clips=[];
for(const name of ['terrydancing','terry']) {
  const file=new URL(`../assets/${name}.gif`,import.meta.url);
  const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','stream=width,height','-of','json',file.pathname]));
  const height=176,width=Math.round(probe.streams[0].width/probe.streams[0].height*height);
  const raw=execFileSync('ffmpeg',['-v','error','-i',file.pathname,'-vf',`fps=25,scale=${width}:${height}:flags=neighbor`,'-f','rawvideo','-pix_fmt','rgba','-'],{maxBuffer:32*1024*1024});
  const frames=[];
  for(let at=0;at<raw.length;at+=width*height*4) frames.push(encodeGR(quantize(raw.subarray(at,at+width*height*4),width,height,'stable'),width,height));
  clips.push({name,width,height,delay:40,count:frames.length,frameSize:frames[0].length,frames});
}
const meta=Buffer.from(JSON.stringify(clips.map(({frames,...clip})=>clip)));
const len=Buffer.alloc(4);len.writeUInt32LE(meta.length);
const packed=Buffer.concat([len,meta,...clips.flatMap(c=>c.frames)]);
const dest=new URL('../assets/terry-sprites.gr.gz',import.meta.url);
writeFileSync(dest,gzipSync(packed,{level:9}));
console.log(`${clips.reduce((n,c)=>n+c.count,0)} GR frames, ${readFileSync(dest).length} compressed bytes`);
