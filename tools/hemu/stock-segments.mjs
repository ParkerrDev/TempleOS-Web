//Finds where each stock RAM snapshot can be cut so its parts inflate at once:
//  node tools/hemu/stock-segments.mjs           check engine/StockSegments.js
//  node tools/hemu/stock-segments.mjs --write   rewrite it from hemu/
//A gzip stream inflates in one pass, since every block may copy from the 32 KB
//before it. A block that starts after 32 KB of zeros needs nothing from before
//but zeros, so a part that starts there is a whole stream of its own: the
//engine's StockParts puts a block of 32 KB of zeros in front of it and an
//empty final block after it. This reads the deflate blocks with a small
//decoder of its own, since zlib does not say where they start, and picks cuts
//that split the work evenly.
import {readFileSync,writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {gunzipSync} from "node:zlib";
import {StockGzipBody,StockParts,StockPartInflate,StockCost} from "../../engine/StockPart.js";
import {STOCK_SEGMENTS} from "../../engine/StockSegments.js";

const ROOT=new URL("../../",import.meta.url),OUT=new URL("engine/StockSegments.js",ROOT),
  PARTS=32,WINDOW=32768;   //cuts to pick from; the engine uses a few
const LEN_BASE=[3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258],
  LEN_EXTRA=[0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0],
  DIST_BASE=[1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577],
  DIST_EXTRA=[0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13],
  ORDER=[16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];

function Table(lengths)
{//A canonical code as a table on its next 15 bits: symbol<<4|length.
  const count=new Array(16).fill(0),next=new Array(16).fill(0),table=new Int32Array(1<<15).fill(-1);
  for(const l of lengths)if(l)count[l]++;
  for(let l=1,code=0;l<16;l++) {code=(code+count[l-1])<<1;next[l]=code;}
  lengths.forEach((l,sym)=>{
    if(!l)return;
    let code=next[l]++,rev=0;
    for(let i=0;i<l;i++) {rev=rev<<1|code&1;code>>=1;}
    for(let i=rev;i<1<<15;i+=1<<l)table[i]=sym<<4|l;
  });
  return table;
}
const FIXED_LIT=Table(Array.from({length:288},(_,i)=>i<144?8:i<256?9:i<280?7:8)),
  FIXED_DIST=Table(new Array(30).fill(5));

export function StockBlocks(deflate,size)
{//Every block's first bit and first output byte, the output, and where its
//32 KB of history last held a byte that was not zero.
  const src=new Uint8Array(deflate.length+8),out=new Uint8Array(size),blocks=[];
  src.set(deflate);
  let pos=0,at=0,nonzero=-1,final=0;
  const Peek=()=>(src[pos>>3]|src[(pos>>3)+1]<<8|src[(pos>>3)+2]<<16|src[(pos>>3)+3]<<24)>>>(pos&7),
    Bits=n=>{const v=Peek()&(1<<n)-1;pos+=n;return v;},
    Sym=t=>{const e=t[Peek()&0x7FFF];if(e<0)throw Error("bad code at bit "+pos);pos+=e&15;return e>>4;};
  while(!final) {
    blocks.push({bit:pos,out:at,nonzero});
    final=Bits(1);
    const type=Bits(2);
    if(type===0) {
      pos=pos+7&~7;
      const len=Bits(16);
      if((Bits(16)^0xFFFF)!==len)throw Error("bad stored block");
      for(let i=0;i<len;i++) {
        const b=out[at++]=src[pos>>3];
        pos+=8;
        if(b)nonzero=at-1;
      }
    } else {
      let lit=FIXED_LIT,dist=FIXED_DIST;
      if(type===2) {
        const hlit=Bits(5)+257,hdist=Bits(5)+1,hclen=Bits(4)+4,cl=new Array(19).fill(0),lens=[];
        for(let i=0;i<hclen;i++)cl[ORDER[i]]=Bits(3);
        const ct=Table(cl);
        while(lens.length<hlit+hdist) {
          const s=Sym(ct);
          if(s<16)lens.push(s);
          else if(s===16) {const p=lens[lens.length-1],n=3+Bits(2);for(let i=0;i<n;i++)lens.push(p);}
          else {const n=s===17?3+Bits(3):11+Bits(7);for(let i=0;i<n;i++)lens.push(0);}
        }
        lit=Table(lens.slice(0,hlit));dist=Table(lens.slice(hlit));
      } else if(type!==1)throw Error("bad block type");
      for(;;) {
        const s=Sym(lit);
        if(s<256) {
          if(s)nonzero=at;
          out[at++]=s;
        } else if(s===256)break;
        else {
          const len=LEN_BASE[s-257]+Bits(LEN_EXTRA[s-257]),d=Sym(dist),
            back=DIST_BASE[d]+Bits(DIST_EXTRA[d]);
          for(let i=0;i<len;i++) {
            const b=out[at]=out[at-back];
            if(b)nonzero=at;
            at++;
          }
        }
      }
    }
  }
  if(at!==size)throw Error("inflated "+at+" bytes, not "+size);
  return {blocks,out,bits:pos};
}

function Cuts(blocks,bits,size)
{//PARTS-1 cuts at blocks with zero history, at even steps of the cost.
  const ok=blocks.filter((b,i)=>i && b.out-b.nonzero>WINDOW),res=[],total=StockCost(bits,size);
  for(let k=1;k<PARTS;k++) {
    const goal=k*total/PARTS;
    let best=null,cost=Infinity;
    for(const b of ok) {
      const c=Math.abs(StockCost(b.bit,b.out)-goal);
      if(c<cost) {best=b;cost=c;}
    }
    if(best && !res.some(r=>r[0]===best.bit))res.push([best.bit,best.out]);
  }
  return res.sort((a,b)=>a[0]-b[0]);
}

async function Check(gz,entry,ramSha256)
{//The parts, each inflated alone, must give the captured RAM, however many.
  for(const n of [entry.cuts.length+1,4,3]) {
    const out=new Uint8Array(entry.size);
    for(const part of StockParts(gz,entry,n))
      await StockPartInflate(part,out);
    if(createHash("sha256").update(out).digest("hex")!==ramSha256)
      throw Error(n+" parts do not inflate to the captured RAM");
  }
}

const manifest=JSON.parse(readFileSync(new URL("hemu/stock.json",ROOT),"utf8")),
  write=process.argv.includes("--write"),
  have=write?{}:STOCK_SEGMENTS,res={};
for(const capture of manifest.captures) {
  const gz=readFileSync(new URL("hemu/"+capture.ram,ROOT)),
    sha=createHash("sha256").update(gz).digest("hex");
  if(sha!==capture.gzipSha256)throw Error(capture.ram+" is not the manifest's file");
  let entry=have[sha];
  if(write) {
    const {blocks,out,bits}=StockBlocks(StockGzipBody(gz),capture.ramBytes);
    if(Buffer.compare(Buffer.from(out.buffer,out.byteOffset,out.length),gunzipSync(gz)))
      throw Error("the block reader disagrees with zlib");
    entry={file:capture.ram,size:capture.ramBytes,cuts:Cuts(blocks,bits,capture.ramBytes)};
  } else if(!entry)
    throw Error(`no cuts for ${capture.ram} (${sha}): run node tools/hemu/stock-segments.mjs --write`);
  await Check(gz,entry,capture.ramSha256);
  res[sha]=entry;
  console.log(`${capture.ram}: ${entry.cuts.length+1} parts inflate to the captured RAM`);
}
if(write)writeFileSync(OUT,"//Written by tools/hemu/stock-segments.mjs --write: where each stock RAM\n"+
  "//snapshot, named by its gzip SHA-256, can be cut to inflate in parts.\n"+
  "export const STOCK_SEGMENTS={\n"+Object.entries(res).map(([sha,e])=>
    ` ${JSON.stringify(sha)}:{file:${JSON.stringify(e.file)},size:${e.size},cuts:[\n`+
    e.cuts.map(c=>"  "+JSON.stringify(c)).join(",\n")+"]}").join(",\n")+"\n};\n");
