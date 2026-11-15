import {OsFullscreenExit} from "../../Adam/Os.js";
import {WinDress,WinFocus,WinRestore,WinWorkspaceSave,WinTitle} from "../../Adam/WinMgr.js";
import {VideoPlayer,VideoList,VideoRandom} from "./Video.js";

const style=document.createElement("link");
style.rel="stylesheet";style.href=new URL("./Clip/Panel.css",import.meta.url);
document.head.append(style);
const windows=new Set();
let cascade=0;

export function VideoOpen(video,seconds=0,play=true,id)
{
  let win=document.createElement("div"),x=document.createElement("span"),
    restore={kind:"video",data:{video,seconds}},player;
  win.id=id || "video-"+crypto.randomUUID();win.className="win vidwin";
  x.className="close";x.textContent="[X]";
  function Changed(data)
  {
    restore.data=data;
    win.dataset.title=data.video.t+" · "+data.video.d;
    if (win.isConnected) WinTitle(win,win.dataset.title);
    if (win.isConnected) WinWorkspaceSave();
  }
  player=VideoPlayer(video,seconds,play,Changed,async function (current) {
    const {OpenTranscript}=await import("./SearchWin.js");
    OpenTranscript(current.transcript || current.f);
  });win.append(x,player.element);
  win.dataset.floating="1";win.style.position="fixed";
  win.style.width="min(560px, 92vw)";
  win.style.left=Math.max(8,innerWidth/2-280+cascade*30)+"px";
  win.style.top=84+cascade*28+"px";cascade=(cascade+1)%7;
  document.body.append(win);windows.add({win,player,restore});
  function Close()
  {
    player.Close();win.remove();
    for (let entry of windows) if (entry.win==win) windows.delete(entry);
  }
  WinDress(win,{onClose:Close,restore});
  OsFullscreenExit().then(function () {if (win.isConnected) WinFocus(win);});
  return {win,player};
}

export function VideoSeek(file,seconds)
{
  for (let {win,player} of windows)
    if (player.State().video.f==file && win.isConnected) {
      player.Seek(seconds);OsFullscreenExit().then(()=>WinFocus(win));return true;
    }
  return false;
}

export async function VideoRandomOpen()
{
  let videos=await VideoList();
  return VideoOpen(VideoRandom(videos));
}

WinRestore("video",function (data,id) {
  let result=VideoOpen(data.video,data.seconds,false,id);
  if (data.clip) result.player.ShowClip(true);
});

addEventListener("pagehide",function () {
  for (let {player,restore} of windows) restore.data=player.State();
  WinWorkspaceSave();
});
