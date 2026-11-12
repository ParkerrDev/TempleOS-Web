//Fetches, checks and inflates the stock disk for StockDiskAside, off the
//emulator's thread, and hands the bytes back without a copy.
import {StockDiskFiles} from "./Stock.js";

onmessage=async e=>{
  try {
    const {raw,patch}=await StockDiskFiles(e.data.capture,e.data.manifest);
    postMessage({ok:true,raw,patch},[raw.buffer,patch.buffer]);
  } catch(err) {postMessage({ok:false,msg:String(err?.message||err)});}
};
