// Extract CSS decoration images from V5.03's sys_font_std, without font rasterization.
import {writeFileSync} from "node:fs";
import {deflateSync} from "node:zlib";
import {FONT} from "../hemu/holyc-wasm/src/runtime/font.js";

function Png(path,width,height,pixel)
{
  const raw=Buffer.alloc((width*3+1)*height);
  for (let y=0;y<height;y++) for (let x=0;x<width;x++) {
    const color=pixel(x,y),i=y*(width*3+1)+1+x*3;
    raw.set(color==1?[0,0,170]:[255,255,255],i);
  }
  function Chunk(type,data)
  {
    const body=Buffer.concat([Buffer.from(type),data]),head=Buffer.alloc(4),tail=Buffer.alloc(4);
    let crc=0xffffffff;
    for (const byte of body) {
      crc^=byte;
      for (let bit=0;bit<8;bit++) crc=(crc>>>1)^((crc&1)?0xedb88320:0);
    }
    head.writeUInt32BE(data.length);tail.writeUInt32BE((crc^0xffffffff)>>>0);
    return Buffer.concat([head,body,tail]);
  }
  const header=Buffer.alloc(13);
  header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;
  writeFileSync(new URL(path,import.meta.url),Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),Chunk("IHDR",header),
    Chunk("IDAT",deflateSync(raw)),Chunk("IEND",Buffer.alloc(0))]));
}
Png("Fonts/WinGlyphs.png",2048,16,(x,y)=>{
  const ink=!!(FONT[Math.floor(x/8)*8+y%8]&(1<<(x%8)));
  return ink!==(y>=8)?1:15;
});
for (const solid of [0,1]) {
  const cells=[6,2,8,4,0,4,10,2,12];
  Png(solid?"WinBorderActive.png":"WinBorder.png",24,24,(x,y)=>{
    const ch=cells[Math.floor(y/8)*3+Math.floor(x/8)];
    return ch && FONT[(ch+solid)*8+y%8]&(1<<(x%8))?1:15;
  });
}
