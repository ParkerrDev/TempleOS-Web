import {MAX_FRAMES,MAX_PIXELS} from "../sprite-codec.js";

export function FrameSize(w,h,width)
{
  let factor=Math.min(width/w,480/h,1);
  return {width:Math.max(1,Math.round(w*factor)),
    height:Math.max(1,Math.round(h*factor))};
}

function MediaWait(video,event,signal,start)
{
  return new Promise(function Wait(resolve,reject) {
    let timer,callback,event_ready=false,frame_ready=event=="loadedmetadata";
    function Finish(error) {
      if (!error && (!event_ready || !frame_ready)) return;
      clearTimeout(timer);
      if (callback!==undefined) video.cancelVideoFrameCallback(callback);
      video.removeEventListener(event,Ready);
      video.removeEventListener("error",Failed);
      signal?.removeEventListener("abort",Aborted);
      document.removeEventListener("visibilitychange",Watchdog);
      if (error) reject(error);else resolve();
    }
    function Ready() {event_ready=true;Finish();}
    function FrameReady() {frame_ready=true;Finish();}
    function Failed() {
      Finish(new Error("This browser cannot decode that video. Try MP4 or WebM."));
    }
    function Aborted() {
      Finish(signal.reason || new DOMException("Cancelled.","AbortError"));
    }
    function TimedOut() {
      Finish(new Error("The video decoder did not respond."));
    }
    function Watchdog() {
      clearTimeout(timer);
      if (!document.hidden) timer=setTimeout(TimedOut,15000);
    }
    if (signal?.aborted) {Aborted();return;}
    video.addEventListener(event,Ready,{once:true});
    video.addEventListener("error",Failed,{once:true});
    signal?.addEventListener("abort",Aborted,{once:true});
    document.addEventListener("visibilitychange",Watchdog);
    Watchdog();
    try {
      //Chromium may emit seeked while drawImage reads the previous frame.
      if (!frame_ready) callback=video.requestVideoFrameCallback(FrameReady);
      start();
    } catch (error) {Finish(error);}
  });
}

function VideoNew(file)
{
  let video=document.createElement("video"),url=URL.createObjectURL(file);
  video.muted=true;video.playsInline=true;video.preload="auto";
  function Load() {video.src=url;video.load();}
  function Close() {
    video.removeAttribute("src");video.load();URL.revokeObjectURL(url);
  }
  return {video,load:Load,close:Close};
}

export async function VideoDimensions(file,signal)
{
  let media=VideoNew(file);
  try {
    await MediaWait(media.video,"loadedmetadata",signal,media.load);
    return {width:media.video.videoWidth,height:media.video.videoHeight};
  } finally {media.close();}
}

export async function VideoFrames(file,{width,fps,start,duration,signal,onFrame})
{
  let media=VideoNew(file),{video}=media,frames=[],size,end,count,canvas,ctx,i,time;
  function Seek() {video.currentTime=time;}
  try {
    if (typeof video.requestVideoFrameCallback!="function")
      throw new Error("This browser needs the fallback video decoder.");
    await MediaWait(video,"loadeddata",signal,media.load);
    if (!video.videoWidth || !video.videoHeight ||
        !Number.isFinite(video.duration))
      throw new Error("The video has no usable picture or duration.");
    size=FrameSize(video.videoWidth,video.videoHeight,width);
    end=Math.min(start+duration,video.duration);
    count=Math.max(0,Math.min(MAX_FRAMES,Math.ceil((end-start)*fps),
      Math.floor(MAX_PIXELS/(size.width*size.height))));
    canvas=document.createElement("canvas");
    canvas.width=size.width;canvas.height=size.height;
    ctx=canvas.getContext("2d",{willReadFrequently:true});
    ctx.imageSmoothingEnabled=false;
    for (i=0;i<count;i++) {
      signal?.throwIfAborted();
      time=start+i/fps;
      if (time>=end) break;
      if (video.currentTime!=time)
        await MediaWait(video,"seeked",signal,Seek);
      ctx.drawImage(video,0,0,size.width,size.height);
      frames.push(ctx.getImageData(0,0,size.width,size.height).data);
      onFrame?.(i+1,count);
    }
    return {size,frames};
  } finally {media.close();}
}
