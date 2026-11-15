import {Icon} from "../../Adam/Icons.js";
import {ArchiveFile} from "./Archive.js";
import {ClipPanel} from "./Clip/Panel.js";

let catalog;
export function VideoList()
{
  if (!catalog) catalog=fetch(new URL("Videos.json",import.meta.url)).then(async function (response) {
    if (!response.ok) throw new Error("Could not load the video list.");
    return response.json();
  }).catch(function (error) {catalog=null;throw error;});
  return catalog;
}

export function VideoRandom(videos,current)
{
  let index=videos.findIndex(function (video) {return video.f==current;}),
    count=videos.length-Number(index>=0);
  if (!count) return videos[0];
  let next=Math.floor(Math.random()*count);
  if (index>=0 && next>=index) next++;
  return videos[next];
}

export function VideoPlayer(video,seconds=0,play=true,Changed=function () {},Transcript=function (video) {
  location.href=new URL("../../?transcript="+encodeURIComponent(video.transcript || video.f),import.meta.url);
})
{
  let element=document.createElement("section"),media=document.createElement("div"),
    bar=document.createElement("div"),status=document.createElement("p"),v,
    clip=null,clip_open=false,closed=false,token=0,blob=null,buttons={},list=null,offset=0,conversion=null,alternate=null,convert_button=null;
  element.className="video-player";media.className="video-media";
  bar.className="video-toolbar action-bar";status.className="video-status";
  status.setAttribute("role","status");
  for (let [key,label] of [["previous","Previous video"],["next","Next video"],
      ["random","Random video"],["clip","Clip controls"]]) {
    let button=document.createElement("button");
    button.type="button";button.title=label;button.setAttribute("aria-label",label);
    button.className="icon-button";button.innerHTML=Icon(key);buttons[key]=button;bar.append(button);
    button.addEventListener("click",function () {
      if (key=="clip") ShowClip(!clip_open);
      else Navigate(key);
    });
  }
  buttons.clip.setAttribute("aria-expanded","false");
  const transcript=document.createElement("button"),copy=document.createElement("button");
  transcript.type="button";transcript.className="video-transcript";
  transcript.innerHTML=Icon("file")+" Transcript";transcript.title="Open this video's transcript";
  transcript.onclick=()=>Promise.resolve(Transcript(video)).catch(error=>{status.textContent=error.message;});
  bar.insertBefore(transcript,buttons.clip);
  copy.type="button";copy.className="video-copy";copy.hidden=true;
  copy.onclick=()=>{if (alternate) Load({...alternate,transcript:video.transcript || video.f},State().seconds,true);};
  element.append(media,bar,copy,status);
  function State()
  {
    let at=seconds;
    if (v?.readyState && Number.isFinite(v.currentTime)) at=v.currentTime+offset;
    return {video,seconds:at,clip:clip_open};
  }
  function Save()
  {
    if (!closed) Changed(State());
  }
  function Stop()
  {
    token++;conversion?.abort();conversion=null;
    clip?.Close();clip?.element.remove();clip=null;
    if (v) {
      v.onerror=v.onpause=v.onseeked=v.onloadedmetadata=null;
      v.pause();v.removeAttribute("src");v.load();
    }
    if (blob) URL.revokeObjectURL(blob);
    blob=null;
  }
  function ShowClip(open)
  {
    clip_open=open;
    if (open && !clip) {
      let start=State().seconds;
      if (!v?.readyState) start=seconds;
      clip=ClipPanel(video,start,start+20);element.append(clip.element);
    }
    if (!open && clip) {clip.Close();clip.element.remove();clip=null;}
    buttons.clip.setAttribute("aria-expanded",String(open));
    if (open) clip.element.elements.start.focus();
    Save();
  }
  function Bounds()
  {
    let index=list?.findIndex(function (entry) {return entry.f==video.f;});
    buttons.previous.disabled=!list || index<=0;
    buttons.next.disabled=!list || index<0 || index>=list.length-1;
    buttons.random.disabled=!list?.length;
    const original=list?.find(entry=>entry.f==video.f);
    alternate=list?.find(entry=>entry.f==original?.a) || null;
    copy.hidden=!alternate;
    if (alternate) copy.innerHTML=Icon("play")+" Play "+alternate.f.split(".").pop().toUpperCase()+" copy";
    if (convert_button) convert_button.hidden=!!alternate;
  }
  function Load(next,at=0,autoplay=true)
  {
    Stop();video=next;seconds=at;offset=0;clip_open=false;convert_button=null;
    buttons.clip.setAttribute("aria-expanded","false");
    status.textContent="";media.replaceChildren();
    v=document.createElement("video");v.controls=true;v.autoplay=autoplay;
    v.playsInline=true;v.preload="none";
    if (autoplay) v.preload="metadata";
    v.src=ArchiveFile(video.f);
    if (at) v.src+="#t="+at;
    v.onloadedmetadata=function () {
      if (at && Math.abs(v.currentTime-at)>2) v.currentTime=at;
    };
    v.onpause=Save;v.onseeked=Save;v.onerror=Fallback;media.append(v);
    Bounds();Save();
  }
  async function Convert(start,box,button)
  {
    let job=token,controller=new AbortController(),file=video.f;
    conversion=controller;button.disabled=true;
    try {
      let {convertVideo}=await import("./Convert.js"),result=await convertVideo({
	f:file,start,win:600,signal:controller.signal,onStatus:function (text) {
	  if (!closed && job==token) status.textContent=text;
	}});
      if (closed || job!=token) {URL.revokeObjectURL(result.blobUrl);return;}
      if (blob) URL.revokeObjectURL(blob);
      blob=result.blobUrl;offset=result.start;v.src=blob;v.hidden=false;
      v.onloadedmetadata=function () {v.currentTime=Math.max(0,seconds-offset);};
      v.play().catch(function () {});
      box.replaceChildren();
      if (result.windowed) {
	button.textContent="Next 10 minutes";button.disabled=false;
	button.onclick=function () {Convert(result.start+result.win,box,button);};
	box.append(button);
      }
    } catch (error) {
      if (!closed && job==token) {status.textContent=error.message;button.disabled=false;}
    } finally {
      if (conversion==controller) conversion=null;
    }
  }
  function Fallback()
  {
    let box=document.createElement("div"),button=document.createElement("button"),
      link=document.createElement("a");
    v.onerror=null;v.hidden=true;box.className="video-error";
    box.append("This browser cannot play this original. ");
    button.type="button";button.textContent="Convert and play";
    convert_button=button;button.hidden=!!alternate;
    button.onclick=function () {Convert(Math.max(0,seconds-5),box,button);};
    link.href=ArchiveFile(video.f);link.textContent="Download original";
    link.target="_blank";link.rel="noopener";box.append(button," ",link);
    media.append(box);
  }
  function Navigate(direction)
  {
    let index=list.findIndex(function (entry) {return entry.f==video.f;}),next;
    if (direction=="random") next=VideoRandom(list,video.f);
    else {
      if (direction=="previous") index--;else index++;
      next=list[index];
    }
    if (next) Load(next);
  }
  Load(video,seconds,play);
  VideoList().then(function (videos) {if (!closed) {list=videos;Bounds();}}).
    catch(function (error) {if (!closed) status.textContent=error.message;});
  return {element,State,ShowClip,Seek:function (at) {
    seconds=at;v.currentTime=Math.max(0,at-offset);v.play().catch(function () {});Save();
  },Close:function () {closed=true;Stop();}};
}
