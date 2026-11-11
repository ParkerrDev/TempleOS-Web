import {ArchiveRange,ArchiveFile} from "../Archive.js";

function TimeText(value)
{
  let minutes=Math.floor(value/60),seconds=Math.round(value%60*1000)/1000;
  return minutes+":"+String(seconds).padStart(2,"0");
}

function TimeRead(text)
{
  let parts=text.trim().split(":"),value=0,n;
  if (!parts.length || parts.length>3) return NaN;
  for (let i=0;i<parts.length;i++) {
    if (!/^\d+(\.\d+)?$/.test(parts[i])) return NaN;
    n=Number(parts[i]);
    if (i && n>=60) return NaN;
    value=value*60+n;
  }
  return value;
}

export function ClipPanel(video,start=0,end=start+20)
{
  let form=document.createElement("form"),worker=null,url=null,
    begin,finish,go,status,download,closed=false,generation=0,ext=video.f.split(".").pop().toLowerCase();
  form.className="clip-panel";
  form.innerHTML='<fieldset><legend>Export a video clip</legend>'+
    '<p>Keep the original picture and sound. Up to 10 minutes.</p>'+
    '<div class="clip-times"><label>Start (m:ss) '+
    '<input name="start" aria-label="Clip start" required></label>'+
    '<label>End (m:ss) <input name="end" aria-label="Clip end" required></label>'+
    '<button type="submit">Export clip</button></div>'+
    '<p class="clip-status" role="status"></p>'+
    '<a class="clip-download" hidden>Download clip</a></fieldset>';
  begin=form.elements.start;finish=form.elements.end;
  go=form.querySelector("button");status=form.querySelector(".clip-status");
  download=form.querySelector(".clip-download");
  begin.value=TimeText(Math.max(0,start));
  if (video.n && end>video.n) end=video.n;
  finish.value=TimeText(end);
  if (!["mp4","mov"].includes(ext)) {
    go.disabled=true;
    status.textContent="This format cannot be clipped here yet. ";
    let link=document.createElement("a");
    link.href=ArchiveFile(video.f);link.textContent="Download the original";
    link.rel="noopener";link.target="_blank";
    status.append(link);
  }
  function Stop()
  {
    generation++;worker?.terminate();worker=null;
    begin.disabled=false;finish.disabled=false;
    go.textContent="Export clip";
  }
  function Clear()
  {
    if (url) URL.revokeObjectURL(url);
    url=null;download.hidden=true;download.removeAttribute("href");
  }
  form.addEventListener("submit",function (e) {
    e.preventDefault();
    if (worker) {Stop();status.textContent="Export cancelled.";return;}
    let start=TimeRead(begin.value),end=TimeRead(finish.value),name,job=++generation;
    if (!Number.isFinite(start) || !Number.isFinite(end) ||
        start<0 || end<=start || end-start>600) {
      status.textContent="Choose valid start and end times, up to 10 minutes apart.";
      return;
    }
    Clear();begin.disabled=true;finish.disabled=true;
    go.textContent="Cancel export";status.textContent="Preparing clip…";
    try {
      worker=new Worker(new URL("Worker.js",import.meta.url),{type:"module"});
      worker.onerror=function (e) {
        if (closed || job!=generation) return;
        status.textContent="Export failed: "+e.message;Stop();
      };
      worker.onmessage=function (e) {
        if (closed || job!=generation) return;
        let m=e.data;
        if (m.status) status.textContent=m.status;
        else if (m.error) {status.textContent="Export failed: "+m.error;Stop();}
        else if (m.buf) {
          url=URL.createObjectURL(new Blob([m.buf],{type:m.type}));
          download.href=url;
          name=(video.d || "Terry")+" - "+(video.t || "video")+" - "+
            TimeText(start)+" to "+TimeText(end);
          download.download=name.replace(/[\\/:*?"<>|]/g,"_").slice(0,180)+
            "."+m.extension;
          download.hidden=false;
          status.textContent="Clip ready. Original audio and video preserved.";
          Stop();download.click();
        }
      };
      worker.postMessage({url:ArchiveRange(video.f),start,end});
    } catch (e) {
      status.textContent="Export failed: "+e.message;Stop();
    }
  });
  return {element:form,Close:function () {closed=true;Stop();Clear();}};
}
