import {decodeGR,toRGBA} from './sprite-codec.js';
import {createSpritePlayer} from './sprite-player.js';
export async function playTerrySprite(canvas) {
  const response=await fetch(new URL('./assets/terry-sprites.gr.gz',import.meta.url));
  if(!response.ok)throw new Error('Cannot load Terry sprites.');
  const bytes=new Uint8Array(await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  const length=new DataView(bytes.buffer).getUint32(0,true);
  const clips=JSON.parse(new TextDecoder().decode(bytes.subarray(4,4+length)));
  let offset=4+length;
  for(const clip of clips) {
    clip.frames=[];
    for(let i=0;i<clip.count;i++) {
      const gr=decodeGR(bytes.subarray(offset,offset+clip.frameSize));offset+=clip.frameSize;
      clip.frames.push(new ImageData(toRGBA(gr.indices,gr.width,gr.height),gr.width,gr.height));
    }
  }
  const sequence=clips.flatMap(clip=>[...clip.frames,...clip.frames.slice().reverse()]);
  const ctx=canvas.getContext('2d');
  const player=createSpritePlayer({count:sequence.length,delayMs:clips[0].delay,
    hidden:()=>document.hidden||!canvas.getBoundingClientRect().height,
    draw(index){
      const frame=sequence[index];
      if(canvas.width!==frame.width||canvas.height!==frame.height){canvas.width=frame.width;canvas.height=frame.height;}
      ctx.putImageData(frame,0,0);
    }});
  canvas.dataset.format='TempleOS GR';player.play();
  return player;
}
