// Avoid palette expansion and canvas uploads for byte-identical guest frames.
// Compare every pixel: sampling or a hash alone can miss small animations/collisions.
export function createFrameBlitter(ctx, palette, width=640, height=480) {
  const image=ctx.createImageData(width,height), out=new Uint32Array(image.data.buffer);
  const lastPalette=new Uint32Array(palette);
  let previous=new Uint8Array(width*height), words=new Uint32Array(previous.buffer,0,Math.floor(previous.length/4)), borrowed=false, initialized=false;
  return (indices,w,h,immutable=false)=>{
    if(w!==width||h!==height||indices.length<previous.length)throw new Error('Unexpected guest framebuffer dimensions.');
    for(let i=0;i<16;i++)if(lastPalette[i]!==palette[i]){lastPalette[i]=palette[i];initialized=false;}
    let same=initialized;
    if(same && indices.byteOffset%4===0 && words) {
      const current=new Uint32Array(indices.buffer,indices.byteOffset,words.length);
      for(let i=0;i<words.length;i++)if((current[i]&0x0f0f0f0f)!==(words[i]&0x0f0f0f0f)){same=false;break;}
      if(same)for(let i=words.length*4;i<previous.length;i++)if((indices[i]&15)!==(previous[i]&15)){same=false;break;}
    } else if(same) {
      for(let i=0;i<previous.length;i++)if((indices[i]&15)!==(previous[i]&15)){same=false;break;}
    }
    if(same)return false;
    for(let i=0;i<previous.length;i++)out[i]=palette[indices[i]&15];
    if (immutable) { previous=indices.subarray(0,previous.length); borrowed=true; }
    else { if(borrowed)previous=new Uint8Array(width*height);previous.set(indices.subarray(0,previous.length));borrowed=false; }
    words=previous.byteOffset%4===0 ? new Uint32Array(previous.buffer,previous.byteOffset,Math.floor(previous.length/4)) : null;
    ctx.putImageData(image,0,0);initialized=true;return true;
  };
}
