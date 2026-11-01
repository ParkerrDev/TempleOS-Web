// Guest frames arrive as 640x480 palette indexes. TempleOS draws text on an 8x8 grid, so the screen is always
// shown at a whole number of device pixels per character cell: at any other scale one letter takes different
// shapes in different places, and text wobbles as it moves or redraws. The browser cannot be left to do this.
// At a scale like 1.25 some sample points fall exactly between two guest rows, and GPU rounding then picks one
// or the other by position. So the canvas holds the frame already scaled, with integer maths, and the browser
// only ever multiplies that by a whole number, where no such ties exist.

// The largest such scale that fits the room. Scaling here stops at 15 device pixels per cell and the browser
// multiplies the rest, so the work per frame stays bounded however big the screen is.
export function screenFit(roomWidth, roomHeight, dpr) {
  const perCell=Math.max(1,Math.floor(Math.min(roomWidth*dpr/80,roomHeight*dpr/60)+0.001));
  const zoom=Math.ceil(perCell/15),cell=Math.floor(perCell/zoom);
  return {width:80*cell,height:60*cell,cssWidth:80*cell*zoom/dpr,cssHeight:60*cell*zoom/dpr};
}

// The source index nearest to each output index. Ties always fall the same way.
const nearest=(size,from)=>Uint16Array.from({length:size},(_,i)=>Math.floor((2*i+1)*from/(2*size)));

// Skips identical guest frames, and for the rest expands and uploads only the rows that changed.
// Compares every pixel: sampling or a hash alone can miss small animations and collisions.
export function createFrameBlitter(ctx, palette, width=640, height=480) {
  const lastPalette=new Uint32Array(palette), dirty=new Uint8Array(height), wordsPerRow=width%4===0?width/4:0;
  let outWidth=0, outHeight=0, image=null, out=null, columns=null, rows=null;
  let previous=new Uint8Array(width*height), words=new Uint32Array(previous.buffer,0,Math.floor(previous.length/4)), borrowed=false, initialized=false;
  const findChanges=(indices)=>{
    const current=wordsPerRow&&words&&indices.byteOffset%4===0?new Uint32Array(indices.buffer,indices.byteOffset,words.length):null;
    let changed=false;
    for(let y=0;y<height;y++){
      let differs=0;
      if(current)for(let i=y*wordsPerRow,end=i+wordsPerRow;i<end&&!differs;i++)differs=(current[i]^words[i])&0x0f0f0f0f;
      else for(let i=y*width,end=i+width;i<end&&!differs;i++)differs=(indices[i]^previous[i])&15;
      dirty[y]=differs?1:0;
      if(differs)changed=true;
    }
    return changed;
  };
  const paint=(indices)=>{
    let run=-1, source=-1;
    for(let y=0;y<=outHeight;y++){
      const row=y<outHeight?rows[y]:-1;
      if(row>=0&&dirty[row]){
        if(row===source)out.copyWithin(y*outWidth,(y-1)*outWidth,y*outWidth);
        else for(let x=0,at=y*outWidth,from=row*width;x<outWidth;x++,at++)out[at]=palette[indices[from+columns[x]]&15];
        if(run<0)run=y;
      }else if(run>=0){ctx.putImageData(image,0,0,0,run,outWidth,y-run);run=-1;}
      source=row;
    }
  };
  const draw=(indices,w,h,immutable=false)=>{
    if(w!==width||h!==height||indices.length<previous.length)throw new Error('Unexpected guest framebuffer dimensions.');
    for(let i=0;i<16;i++)if(lastPalette[i]!==palette[i]){lastPalette[i]=palette[i];initialized=false;}
    if(!initialized)dirty.fill(1);
    else if(!findChanges(indices))return false;
    paint(indices);
    if (immutable) { previous=indices.subarray(0,previous.length); borrowed=true; }
    else { if(borrowed)previous=new Uint8Array(width*height);previous.set(indices.subarray(0,previous.length));borrowed=false; }
    words=previous.byteOffset%4===0 ? new Uint32Array(previous.buffer,previous.byteOffset,Math.floor(previous.length/4)) : null;
    initialized=true;return true;
  };
  // Changes the canvas size, which clears it, so the last frame goes straight back on.
  draw.resize=(w,h)=>{
    if(w===outWidth&&h===outHeight)return;
    outWidth=w;outHeight=h;ctx.canvas.width=w;ctx.canvas.height=h;
    image=ctx.createImageData(w,h);out=new Uint32Array(image.data.buffer);
    columns=nearest(w,width);rows=nearest(h,height);
    if(initialized){dirty.fill(1);paint(previous);}
  };
  draw.resize(width,height);
  return draw;
}
