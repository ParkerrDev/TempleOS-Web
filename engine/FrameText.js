import {FONT} from "../holyc-wasm/src/runtime/font.js";

const glyphs=new Map();
for (let ch=32;ch<127;ch++) {
  let lo=0,hi=0;
  for (let y=0;y<4;y++) {
    lo|=FONT[ch*8+y]<<(y*8);
    hi|=FONT[ch*8+y+4]<<(y*8);
  }
  glyphs.set(lo+":"+hi,String.fromCharCode(ch));
}

export function FrameTop(u8,width)
{//The text actually painted in the first row, never a later guest value.
  let res="",colors=new Uint8Array(16);
  for (let cx=0;cx<width>>3;cx++) {
    colors.fill(0);
    let bg=0,lo=0,hi=0;
    for (let y=0;y<8;y++)
      for (let x=0;x<8;x++)
        colors[u8[y*width+cx*8+x]&15]++;
    for (let c=1;c<16;c++)
      if (colors[c]>colors[bg])
        bg=c;
    for (let y=0;y<8;y++) {
      let row=0;
      for (let x=0;x<8;x++)
        if ((u8[y*width+cx*8+x]&15)!=bg)
          row|=1<<x;
      if (y<4)
        lo|=row<<(y*8);
      else
        hi|=row<<((y-4)*8);
    }
    res+=glyphs.get(lo+":"+hi)||"?";
  }
  return res;
}

export function FrameFps(top)
{//Null when a fullscreen program covers the OS's FPS text.
  const m=/\bFPS:? *([0-9]+)(?![0-9?])/.exec(top);
  return m?Number(m[1]):null;
}
