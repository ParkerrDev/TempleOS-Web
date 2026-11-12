export function SoundQueue() {
  let frequency=0,events=[],stamp=null,error="";
  return {
    get frequency(){return frequency;},
    push(hz,ns) {
      frequency=hz;
      if(ns===undefined){stamp=null;events=[];return;}
      if(stamp!==null&&ns<stamp)error="Speaker clock moved backwards";
      stamp=ns;
      if(events.length>=4096)error="Speaker event queue overflow";
      if(error)events=[];
      else events.push([hz,ns.toString()]);
    },
    clear(){events=[];error="";},
    take(end) {
      if(stamp===null||end===null){events=[];return {timed:false,frequency};}
      if(end<stamp)error="Speaker watermark precedes its events";
      const result={timed:true,frequency,end:end.toString(),events,error};
      events=[];error="";return result;
    }
  };
}
