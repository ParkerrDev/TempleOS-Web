//The Terry window's sprite: TempleOS GR frames, gzipped, each decoded only
//when it is drawn (decoding all of them first held the page for a second).
import {decodeGR,toRGBA} from "./sprite-codec.js";
import {createSpritePlayer} from "./sprite-player.js";

let cvs,ctx,seq=[],w=0,h=0,last_w=0;

function Draw(index)
{
  let gr=decodeGR(seq[index]);
  if (gr.width!=last_w) {
    ctx.clearRect(0,0,w,h);
    last_w=gr.width;
  }
  ctx.putImageData(new ImageData(toRGBA(gr.indices,gr.width,gr.height),
    gr.width,gr.height),w-gr.width>>1,h-gr.height);
}

function Hidden()
{
  return document.hidden || !cvs.getBoundingClientRect().height;
}

export async function playTerrySprite(canvas)
{//Plays each clip forward, then back, then the next, in a canvas sized
//for the largest frame (as index.html sizes it), so nothing moves.
  let res=await fetch(new URL("./assets/terry-sprites.gr.gz",import.meta.url)),
    bytes,len,clips,clip,frames,i,offset,player;
  if (!res.ok)
    throw new Error("Cannot load Terry sprites.");
  bytes=new Uint8Array(await new Response(res.body.pipeThrough(
    new DecompressionStream("gzip"))).arrayBuffer());
  len=new DataView(bytes.buffer).getUint32(0,true);
  clips=JSON.parse(new TextDecoder().decode(bytes.subarray(4,4+len)));
  offset=4+len;
  for (clip of clips) {
    frames=[];
    for (i=0;i<clip.count;i++) {
      frames.push(bytes.subarray(offset,offset+clip.frameSize));
      offset+=clip.frameSize;
    }
    seq.push(...frames,...frames.slice().reverse());
    w=Math.max(w,clip.width);
    h=Math.max(h,clip.height);
  }
  cvs=canvas;
  ctx=canvas.getContext("2d");
  if (canvas.width!=w || canvas.height!=h) {
    canvas.width=w;
    canvas.height=h;
  }
  player=createSpritePlayer({count:seq.length,delayMs:clips[0].delay,
    hidden:Hidden,draw:Draw});
  canvas.dataset.format="TempleOS GR";
  player.play();
  return player;
}
