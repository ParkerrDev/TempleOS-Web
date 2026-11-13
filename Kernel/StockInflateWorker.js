//One part of a stock RAM snapshot, inflated on a thread of its own into the
//engine worker's shared buffer (StockPart.js). StockPart.js comes by this
//helper's own URL too (StockPool.js says why).
const part=import("./StockPart.js"+new URL(import.meta.url).search);
part.catch(()=>{});

onmessage=async ({data:{part:p,buf}})=>{
  try {
    const {StockPartInflate}=await part;
    postMessage({ok:true,wrote:await StockPartInflate(p,new Uint8Array(buf))});
  } catch (error) {postMessage({ok:false,msg:String(error?.message||error)});}
};
