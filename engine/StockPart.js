//A stock RAM snapshot inflates in parts at once. A cut is a deflate block that
//starts after 32 KB of zeros (tools/hemu/stock-segments.mjs finds them), so the
//part from one cut to the next is a whole raw deflate stream once a block of
//zeros goes before it, for the copies that reach back, and an empty final
//block after it. Each part is inflated on its own thread into one shared
//buffer.
const Fail=message=>{throw Error("Stock TempleOS parts: "+message);};
const ZEROS_MIN=128,ZERO_RUN=258;   //a literal 0, then 258-byte copies: past 32 KB

export function StockGzipBody(gz)
{//The deflate stream inside a gzip file: after its header, before its trailer.
  if(!ArrayBuffer.isView(gz))gz=new Uint8Array(gz);
  if(gz.length<18||gz[0]!==0x1F||gz[1]!==0x8B||gz[2]!==8)Fail("not a gzip file");
  const flags=gz[3];
  let at=10;
  if(flags&4)at+=2+(gz[at]|gz[at+1]<<8);
  for(const bit of [8,16])
    if(flags&bit) {
      while(at<gz.length&&gz[at])at++;
      at++;
    }
  if(flags&2)at+=2;
  if(at>gz.length-8)Fail("gzip header runs past the file");
  return gz.subarray(at,gz.length-8);
}

function Zeros(phase)
{//A fixed-code block that writes at least 32 KB of zeros and ends at bit phase
//mod 8. Each 258-byte copy is 13 bits, so 0 to 7 more of them reach any phase.
  let extra=0;
  while((18+13*(ZEROS_MIN+extra))%8!==phase)extra++;
  const runs=ZEROS_MIN+extra,bits=18+13*runs,res=new Uint8Array(bits+7>>3);
  let pos=0;
  const Put=(value,n)=>{
    for(let i=0;i<n;i++,pos++)
      if(value>>i&1)res[pos>>3]|=1<<(pos&7);
  },Code=(code,n)=>{   //Huffman codes go most significant bit first
    for(let i=n-1;i>=0;i--,pos++)
      if(code>>i&1)res[pos>>3]|=1<<(pos&7);
  };
  Put(2,3);              //not final, fixed codes
  Code(0x30,8);          //literal 0
  for(let i=0;i<runs;i++) {
    Code(0xC5,8);        //length 258
    Code(0,5);           //distance 1
  }
  Code(0,7);             //end of block
  return {bytes:res,bits,out:1+ZERO_RUN*runs};
}

//Inflating takes about 1 ms a MB written and 8 ms a MB read, so a part costs
//about its output bytes plus its input bits.
export const StockCost=(bit,out)=>bit+out;

export function StockParts(gz,entry,n)
{//At most n streams of about equal cost, each with the output range it fills.
  const body=StockGzipBody(gz),cuts=entry.cuts,res=[],picked=[],
    total=StockCost(body.length*8,entry.size);
  n=Math.max(1,Math.min(n|0,cuts.length+1));
  for(let k=1;k<n;k++) {
    let best=null;
    for(const c of cuts)
      if((!picked.length || c[0]>picked[picked.length-1][0]) &&
          (!best || Math.abs(StockCost(...c)-k*total/n)<Math.abs(StockCost(...best)-k*total/n)))
        best=c;
    if(best)picked.push(best);
  }
  n=picked.length+1;
  for(let k=0;k<n;k++) {
    const [a,out]=k?picked[k-1]:[0,0],last=k===n-1,b=last?body.length*8:picked[k][0],
      size=(last?entry.size:picked[k][1])-out;
    if(!(a<b)||size<=0||out<0||out+size>entry.size)Fail("bad cuts");
    const pre=a?Zeros(a&7):{bytes:new Uint8Array(0),bits:0,out:0},
      tail=last?0:10,bytes=new Uint8Array(pre.bits+b-a+tail+7>>3),off=pre.bits>>3,mask=(1<<(a&7))-1;
    bytes.set(pre.bytes);
    const src=body.subarray(a>>3,b+7>>3);
    if(off+src.length>bytes.length)Fail("bad cuts");
    const keep=bytes[off]&mask;
    bytes.set(src,off);
    bytes[off]=bytes[off]&~mask|keep;
    if(!last) {   //an empty final block where the next part starts
      const q=pre.bits+b-a;
      bytes[q>>3]&=(1<<(q&7))-1;
      bytes[q>>3]|=3<<(q&7)&0xFF;
      if((q&7)===7)bytes[(q>>3)+1]|=1;
    }
    res.push({bytes,skip:pre.out,out,size});
  }
  return res;
}

function Zero(v)
{
  if(v.byteOffset&3||v.length&3)return false;
  const w=new Int32Array(v.buffer,v.byteOffset,v.length>>2);
  for(let i=0;i<w.length;i++)if(w[i])return false;
  return true;
}

export async function StockPartInflate(part,out)
{//Fills out[part.out..] with the part and gives the ranges it wrote. out must
//start as zeros: chunks of zeros are not written, so the pages they fall on
//are never touched.
  const reader=new Blob([part.bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader(),
    end=part.out+part.size,res=[];
  let skip=part.skip,at=part.out;
  try {
    for(;;) {
      const {done,value}=await reader.read();
      if(done)break;
      let v=value;
      if(skip) {
        const n=Math.min(skip,v.length);
        skip-=n;v=v.subarray(n);
      }
      if(at+v.length>end)Fail("a part inflated past its end");
      if(!Zero(v)) {
        out.set(v,at);
        if(res.length && res[res.length-1][1]===at)res[res.length-1][1]+=v.length;
        else res.push([at,at+v.length]);
      }
      at+=v.length;
    }
  } finally {await reader.cancel().catch(()=>{});}
  if(at!==end||skip)Fail("a part inflated to the wrong size");
  return res;
}
