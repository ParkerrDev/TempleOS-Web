import {RangeSource} from "./Range.js";
import {Mp4Clip} from "./Mp4.js";

self.onmessage=async function (e)
{
  try {
    let m=e.data,source=RangeSource(m.url,function (text) {
      self.postMessage({status:text});
    }),buf=await Mp4Clip(source,m.start,m.end);
    self.postMessage({buf,type:"video/mp4",extension:"mp4"},[buf]);
  } catch (e) {
    self.postMessage({error:e.message});
  }
};
