// Guest frames arrive as 640x480 palette indexes and are shown the way emulators call "sharp bilinear".
// Nearest-neighbour scaling by anything but a whole number gives guest pixels uneven sizes: at 1.125, one row
// and one column in every eight come out doubled, so lines and letters look jagged, and at a scale like 1.25
// GPU rounding even picks different rows by position, so text wobbles. So the canvas holds the frame scaled
// by a whole number k with integer maths, where every guest pixel is the same k x k block, and the browser
// scales that the rest of the way with smoothing, which only softens the edge between two blocks. A letter keeps one shape everywhere, and the screen fills its room at any size. When the
// rest of the way is itself a whole number the browser multiplies it without smoothing, and pixels stay hard.

// k is 1 or 2, so the canvas is at most 1280x960 however big the screen is, and the work per frame stays
// bounded. When the screen is a whole multiple of 640 wide, k is 1 and the browser does all of it exactly.
// Otherwise a screen wider than 640 takes k=2: the soft edge is one backing pixel wide, so k=2 makes it half
// as wide as k=1 would, under a device pixel up to 1280 wide and under two up to 2560.
// When a whole multiple of 640 fills at least 95% of the room, the screen takes that instead: hard edges
// are worth a slightly smaller screen. The device size is a multiple of 4 wide, so the 4:3 height is whole.
export function screenFit(roomWidth, roomHeight, dpr) {
  const room=Math.max(4,Math.floor(Math.min(roomWidth*dpr,roomHeight*dpr*4/3)/4+0.001)*4);
  const whole=640*Math.floor(room/640),device=whole>0&&whole>=room*0.95?whole:room;
  const smooth=device%640!==0,k=smooth&&device>640?2:1;
  return {width:640*k,height:480*k,cssWidth:device/dpr,cssHeight:device*3/4/dpr,smooth};
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
        else if(outWidth===width)for(let x=0,at=y*outWidth,from=row*width;x<width;x++,at++)out[at]=palette[indices[from+x]&15];
        else if(outWidth===2*width)for(let x=0,at=y*outWidth,from=row*width;x<width;x++,at+=2){const c=palette[indices[from+x]&15];out[at]=c;out[at+1]=c;}
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
