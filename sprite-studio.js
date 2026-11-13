import { PALETTE, MAX_PIXELS, MAX_FRAMES, toRGBA, encodeGIF, spritePackage, SPRITE_PLAYER } from './sprite-codec.js';
import {createSpritePlayer} from './sprite-player.js';
import {GrLoad} from './sprites/Gr.js';
import {FrameSize,VideoFrames,VideoDimensions} from './sprites/Frames.js';
const $ = id => document.getElementById(id);
// The iframe shares the desktop cursor so it stays consistent across window edges.
const desktopCursor = window !== parent ? parent.__desktopCursor : null;
if (desktopCursor?.enabled) {
  document.body.classList.add('xcursor');
  const moveCursor = event => desktopCursor.move(event, window.frameElement);
  addEventListener('pointermove', moveCursor, {capture:true, passive:true});
  addEventListener('pointerdown', moveCursor, {capture:true, passive:true});
  document.addEventListener('mouseleave', desktopCursor.hide);
  addEventListener('blur', desktopCursor.hide);
}
let source = null, frames = [], originals = [], previews = [], size = {width:160,height:120}, delayMs = 40;
let player = null, ff = null, busy = false, cancelled = false;
let cancelMapping = null,gr_codec=null,videoAbort=null;
let rateStart=0,rateFrames=0;
for (const color of PALETTE) { const s=document.createElement('span'); s.style.background=`rgb(${color})`; s.title=color.join(', '); $('palette').append(s); }
function status(s) { $('status').textContent=s; }
function playbackStop() { player?.stop(); $('play').textContent='Play';$('playbackRate').textContent=''; }
addEventListener('studio-close', playbackStop);
function exportsEnabled(yes) { for(const id of ['gr','png','gif','package','frame','play']) $(id).disabled=!yes; }
function clearResult() { playbackStop(); player=null;frames=[]; originals=[];previews=[]; exportsEnabled(false); $('frameLabel').textContent='0 / 0'; }
function selectFile(file) {
  if (busy || !file) return;
  if (file.size > 100*1024*1024) { status('Choose a file smaller than 100 MB.'); return; }
  source=file; clearResult(); $('filename').textContent=file.name; $('convert').disabled=false; status('Ready to convert.');
}
$('file').onchange=e=>selectFile(e.target.files[0]);
$('file').disabled=false;
for(const name of ['dragenter','dragover']) document.addEventListener(name,e=>{e.preventDefault();document.body.classList.add('drag');});
document.addEventListener('dragleave',()=>document.body.classList.remove('drag'));
document.addEventListener('drop',e=>{e.preventDefault();document.body.classList.remove('drag');selectFile(e.dataTransfer.files[0]);});
$('alpha').oninput=()=>{$('alphaValue').textContent=$('alpha').value;};
$('strength').oninput=()=>{$('strengthValue').textContent=$('strength').value+'%';};
$('dither').onchange=()=>{$('strength').disabled=$('dither').value!=='stable';};
const surfaces=new Map(['original','preview'].map(id=>{const canvas=$(id);return [id,{canvas,ctx:canvas.getContext('2d')}];}));
function paint(id, data) { const {canvas,ctx}=surfaces.get(id);if(canvas.width!==size.width||canvas.height!==size.height){canvas.width=size.width;canvas.height=size.height;}ctx.putImageData(data,0,0); }
function showFrame(n) {
  if (!frames.length) return;
  $('frame').value=n; paint('original',originals[n]); paint('preview',previews[n]);
  $('frameLabel').textContent=`${n+1} / ${frames.length}`;
  if(player?.playing) {
    rateFrames++;
    const now=performance.now();
    if(now-rateStart>=1000){$('playbackRate').textContent=`${Math.round(rateFrames*1000/(now-rateStart))} fps`;rateFrames=0;rateStart=now;}
  }
}
$('frame').oninput=()=>{playbackStop();showFrame(Number($('frame').value));};
$('play').onclick=()=>{
  if(player?.playing){playbackStop();return;}
  $('play').textContent='Pause';
  rateStart=performance.now();rateFrames=0;
  player?.play(Number($('frame').value));
};
async function decoder() {
  if (!ff) {
    status('Loading media decoder (32 MB, first use)...');
    const {FFmpeg}=await import('./vendor/ffmpeg/ffmpeg/index.js');
    if (cancelled) throw new Error('Cancelled.');
    const next=new FFmpeg();ff=next;
    try {
      await next.load({coreURL:new URL('./vendor/ffmpeg/core/ffmpeg-core.js',location.href).href,wasmURL:new URL('./vendor/ffmpeg/core/ffmpeg-core.wasm',location.href).href});
    } catch (error) {
      if (ff===next) ff=null;
      next.terminate();throw error;
    }
  }
  return ff;
}
function mapFrames(raw,mode,alpha,strength) {
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./sprite-convert-worker.js',import.meta.url),{type:'module'}),result=[];
    const finish=(error)=>{worker.terminate();cancelMapping=null;error?reject(error):resolve(result);};
    cancelMapping=()=>finish(new Error('Cancelled.'));
    worker.onerror=e=>finish(new Error(e.message||'Unable to convert these frames.'));
    worker.onmessage=({data:m})=>{
      if(m.type==='error'){finish(new Error(m.message));return;}
      if(m.type==='done'){finish();return;}
      result.push(m.indices);
      originals.push(new ImageData(new Uint8ClampedArray(m.original.buffer,m.original.byteOffset,m.original.byteLength),size.width,size.height));
      previews.push(new ImageData(m.preview,size.width,size.height));
      status(`Mapping frame ${m.index+1} / ${raw.length} to the TempleOS palette...`);
    };
    worker.postMessage({frames:raw,width:size.width,height:size.height,mode,alpha,strength},raw.map(frame=>frame.buffer));
  });
}
$('cancel').onclick=()=>{cancelled=true;videoAbort?.abort();cancelMapping?.();if(ff){ff.terminate();ff=null;}status('Cancelling...');};
$('controls').onsubmit=async e=>{
  e.preventDefault(); if(!source||busy)return;
  busy=true;cancelled=false;clearResult();$('convert').disabled=true;$('file').disabled=true;$('cancel').hidden=false;
  try {
    const width=Number($('width').value), fps=Number($('fps').value), duration=Number($('duration').value), start=Number($('start').value);
    if(!Number.isInteger(width)||width<8||width>640||!Number.isFinite(fps)||fps<5||fps>50||!Number.isFinite(duration)||duration<0.1||duration>10||!Number.isFinite(start)||start<0||start>86400) throw new Error('Check the width, frame rate, start time and clip length.');
    delayMs=1000/fps;
    gr_codec=await GrLoad();
    if (cancelled) throw new Error("Cancelled.");
    const isGR=/\.gr$/i.test(source.name), isGIF=source.type==='image/gif'||/\.gif$/i.test(source.name), isVideo=source.type.startsWith('video/');
    let raw=[];
    if(isGR){
      if (source.size>gr_codec.maxSize) throw new Error("Sprite data exceeds the maximum GR size.");
      const gr=gr_codec.decodeGR(new Uint8Array(await source.arrayBuffer()));
      size={width:gr.width,height:gr.height};raw=[toRGBA(gr.indices,gr.width,gr.height)];
    }
    else if(isVideo && HTMLVideoElement.prototype.requestVideoFrameCallback) {
      videoAbort=new AbortController();
      ({size,frames:raw}=await VideoFrames(source,{width,fps,start,duration,
        signal:videoAbort.signal,onFrame:(frame,count)=>status(`Decoding frame ${frame} / ${count}...`)}));
    }
    else {
      let natural,bitmap;
      if(isVideo) {
        videoAbort=new AbortController();
        natural=await VideoDimensions(source,videoAbort.signal);
      } else {
        bitmap=await createImageBitmap(source);
        natural={width:bitmap.width,height:bitmap.height};
      }
      size=FrameSize(natural.width,natural.height,width);
      if(isGIF||isVideo){
        bitmap?.close();
        const count=Math.min(MAX_FRAMES,Math.ceil(duration*fps),Math.floor(MAX_PIXELS/(size.width*size.height)));
        const worker=await decoder(); if(cancelled)throw new Error('Cancelled.');
        try {
          await worker.writeFile('sprite-input',new Uint8Array(await source.arrayBuffer()));
          status(`Decoding up to ${count} frames...`);
          const rc=await worker.exec(['-ss',String(start),'-i','sprite-input','-t',String(duration),'-vf',`fps=${fps},scale=${size.width}:${size.height}:flags=neighbor`,'-frames:v',String(count),'-an','-f','rawvideo','-pix_fmt','rgba','-y','sprite-frames.rgba']);
          if(rc!==0)throw new Error('Unable to decode this clip. Try another format or a shorter clip.');
          const bytes=await worker.readFile('sprite-frames.rgba'), stride=size.width*size.height*4;
          for(let at=0;at+stride<=bytes.length;at+=stride)raw.push(bytes.slice(at,at+stride));
        } finally { if(!cancelled) {for(const name of ['sprite-input','sprite-frames.rgba'])try{await worker.deleteFile(name);}catch{}} }
      } else {
        const canvas=document.createElement('canvas');canvas.width=size.width;canvas.height=size.height;
        const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.drawImage(bitmap,0,0,size.width,size.height);bitmap.close();
        raw=[ctx.getImageData(0,0,size.width,size.height).data];
      }
    }
    if(!raw.length)throw new Error('No frames at that start time. Choose an earlier point.');
    if(cancelled)throw new Error('Cancelled.');
    const result=await mapFrames(raw,$('dither').value,Number($('alpha').value),Number($('strength').value));
    frames=result;player=createSpritePlayer({count:frames.length,delayMs,draw:showFrame});
    $('empty').hidden=true;$('frame').max=frames.length-1;showFrame(0);exportsEnabled(true);
    status(`${size.width} x ${size.height} pixels, ${frames.length} frame${frames.length===1?'':'s'} at ${fps} fps (${(frames.length/fps).toFixed(2)} s), 16 colors + transparency.`);
  } catch(err){clearResult();status(cancelled?'Conversion cancelled.':String(err?.message||err));}
  finally{videoAbort=null;busy=false;$('convert').disabled=!source;$('file').disabled=false;$('cancel').hidden=true;}
};
function download(bytes,name,type){const url=URL.createObjectURL(new Blob([bytes],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
$('gr').onclick=()=>download(gr_codec.encodeGR(frames[Number($('frame').value)],size.width,size.height),'Sprite.GR','application/octet-stream');
$('gif').onclick=()=>download(encodeGIF(frames,size.width,size.height,delayMs),'Sprite.gif','image/gif');
let player_source;
$('package').onclick=async()=>{
  const selected=frames,{width,height}=size,delay=delayMs;
  try {
    if (!player_source) player_source=(async()=>{
      const response=await fetch(SPRITE_PLAYER);
      if (!response.ok) throw new Error("Could not load the native sprite player.");
      return response.text();
    })().catch(error=>{player_source=null;throw error;});
    const program=await player_source,
      files=selected.map(frame=>gr_codec.encodeGR(frame,width,height));
    download(spritePackage(files,width,height,delay,program),'TempleOS-Sprite.zip','application/zip');
  } catch (error) {status(error.message);}
};
$('png').onclick=()=>{
  const cols=Math.min(frames.length,Math.max(1,Math.floor(2048/size.width))),rows=Math.ceil(frames.length/cols);
  const canvas=document.createElement('canvas');canvas.width=cols*size.width;canvas.height=rows*size.height;const ctx=canvas.getContext('2d');
  frames.forEach((f,i)=>ctx.putImageData(new ImageData(toRGBA(f,size.width,size.height),size.width,size.height),(i%cols)*size.width,Math.floor(i/cols)*size.height));
  canvas.toBlob(blob=>{if(blob)download(blob,'Sprite-sheet.png','image/png');else status('PNG export failed. Try a smaller clip.');},'image/png');
};
