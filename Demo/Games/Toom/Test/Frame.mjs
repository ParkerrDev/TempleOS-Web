import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {deflateSync} from 'node:zlib';

export function FrameWrite(pixels,path,width,height)
{
  assert.equal(pixels.length,width*height);
  const palette=[0x000000,0x0000AA,0x00AA00,0x00AAAA,0xAA0000,0xAA00AA,0xAA5500,0xAAAAAA,
    0x555555,0x5555FF,0x55FF55,0x55FFFF,0xFF5555,0xFF55FF,0xFFFF55,0xFFFFFF];
  const raw=Buffer.alloc((width*3+1)*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    const rgb=palette[pixels[x+y*width]];assert(rgb!==undefined);
    const at=y*(width*3+1)+1+x*3;raw[at]=rgb>>16;raw[at+1]=rgb>>8;raw[at+2]=rgb;
  }
  function chunk(name,data) {
    const body=Buffer.concat([Buffer.from(name),data]);let crc=0xFFFFFFFF;
    for(const b of body) {crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xEDB88320:0);}
    const out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);body.copy(out,4);
    out.writeUInt32BE((crc^0xFFFFFFFF)>>>0,out.length-4);return out;
  }
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;
  const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),
    chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
  writeFileSync(path,png);
}
