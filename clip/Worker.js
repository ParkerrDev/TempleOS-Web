import {RangeSource} from "./Range.js";
import {Mp4Clip} from "./Mp4.js";
import {MkvClip} from "./Mkv.js";

self.onmessage=async function (e)
{
  try {
    let m=e.data,source=RangeSource(m.url,function (text) {
      self.postMessage({status:text});
    }),res;
    if (["mkv","webm"].includes(m.format)) {
      res=await MkvClip(source,m.start,m.end);
      res.type=m.format=="webm"?"video/webm":"video/x-matroska";
      res.extension=m.format;res.aligned=true;
    } else
      res={buf:await Mp4Clip(source,m.start,m.end),type:"video/mp4",
        extension:"mp4",start:m.start,end:m.end};
    self.postMessage(res,[res.buf]);
  } catch (e) {
    self.postMessage({error:e.message});
  }
};
