//One part of a stock RAM snapshot, inflated on a thread of its own into the
//engine worker's shared buffer (StockPart.js).
import {StockPartInflate} from "./StockPart.js";

onmessage=async ({data:{part,buf}})=>{
  try {postMessage({ok:true,wrote:await StockPartInflate(part,new Uint8Array(buf))});}
  catch (error) {postMessage({ok:false,msg:String(error?.message||error)});}
};
