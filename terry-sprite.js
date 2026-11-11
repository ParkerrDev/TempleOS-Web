//The Terry window's sprite: TempleOS GR frames, gzipped, each decoded only
//when it is drawn (decoding all of them first held the page for a second).
import {toRGBA} from "./sprite-codec.js";
import {GrLoad} from "./sprites/Gr.js";
import {createSpritePlayer} from "./sprite-player.js";

export async function playTerrySprite(canvas)
{//Plays each clip forward, then back, then the next, in a canvas sized
//for the largest frame (as index.html sizes it), so nothing moves.
  let res=await fetch(new URL("./assets/terry-sprites.gr.gz",import.meta.url)),
    bytes,len,clips,clip,frames,i,offset,player,w=0,h=0,last_w=0,last_h=0;
  const seq=[],{decodeGR}=await GrLoad(),ctx=canvas.getContext("2d");
  if (!res.ok)
    throw new Error("Cannot load Terry sprites.");
  bytes=new Uint8Array(await new Response(res.body.pipeThrough(
    new DecompressionStream("gzip"))).arrayBuffer());
  if (bytes.length<4) throw new Error("Truncated Terry animation.");
  len=new DataView(bytes.buffer).getUint32(0,true);
  if (len>bytes.length-4) throw new Error("Truncated Terry animation index.");
  clips=JSON.parse(new TextDecoder().decode(bytes.subarray(4,4+len)));
  offset=4+len;
  for (clip of clips) {
    if (!Number.isInteger(clip.count) || clip.count<1 || clip.count>600 ||
        !Number.isInteger(clip.frameSize) || clip.frameSize<32 ||
        clip.count*clip.frameSize>bytes.length-offset ||
        !Number.isInteger(clip.width) || clip.width<1 || clip.width>640 ||
        !Number.isInteger(clip.height) || clip.height<1 || clip.height>480 ||
        clip.delay!=clips[0].delay)
      throw new Error("Invalid Terry animation index.");
    frames=[];
    for (i=0;i<clip.count;i++) {
      frames.push(bytes.subarray(offset,offset+clip.frameSize));
      offset+=clip.frameSize;
    }
    seq.push(...frames,...frames.slice().reverse());
    w=Math.max(w,clip.width);
    h=Math.max(h,clip.height);
  }
  if (offset!=bytes.length || !seq.length) throw new Error("Invalid Terry animation length.");
  if (canvas.width!=w || canvas.height!=h) {
    canvas.width=w;
    canvas.height=h;
  }
  player=createSpritePlayer({count:seq.length,delayMs:clips[0].delay,
    hidden:()=>document.hidden || !canvas.getBoundingClientRect().height,
    draw(index) {
      const gr=decodeGR(seq[index]);
      if (gr.width!=last_w || gr.height!=last_h) {
        ctx.clearRect(0,0,w,h);last_w=gr.width;last_h=gr.height;
      }
      ctx.putImageData(new ImageData(toRGBA(gr.indices,gr.width,gr.height),
        gr.width,gr.height),w-gr.width>>1,h-gr.height);
    }});
  canvas.dataset.format="TempleOS GR";
  player.play();
  return player;
}
