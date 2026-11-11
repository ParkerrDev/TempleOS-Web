//The Chat window. It connects once the page is idle and stays connected, so
//the Menu's Chat button and the tab's title count what others say while it
//is shut, and the browser says so while the tab is in the background. Mute
//in the window silences all three. What others wrote only goes in as text.
import {WinAdd,WinFocus} from "./WinMgr.js";
import {$} from "./Os.js";
import {createChat,savedNick,saveNick,stamp} from "./chat.js";
import {DEFAULT_NICK,KEEP,MAX_NICK,MAX_TEXT} from "./chat/rules.js";

const CSS='/* Chat window: opens without the dark backdrop, in the corner, so the OS stays usable beside it.\n'+
  '   Colors on the blue log are TempleOS palette entries (LTCYAN, YELLOW, LTGRAY, LTGREEN, LTRED). */\n'+
  '#chatOverlay { justify-content:flex-end; align-items:flex-end; }\n'+
  '@media (max-width:979.98px) { #chatOverlay { justify-content:center; align-items:flex-start; padding-top:8px; }   /* clear of a phone\'s keyboard */ }\n'+
  '#chatWin { display:flex; flex-direction:column; gap:6px; width:min(400px,94vw); height:min(64vh,540px); margin:0; padding:8px; }\n'+
  '#chatTop { display:flex; gap:8px; align-items:center; flex:0 0 auto; }\n'+
  '#chatTop button { width:auto; height:var(--ctlh); }\n'+
  '#chatStatus { flex:1 1 auto; color:var(--blue); font-size:12px; min-height:1em; }\n'+
  '#chatLog { flex:1 1 auto; min-height:0; overflow:auto; background:var(--blue); color:#fff; padding:6px 8px; font-size:12px; line-height:1.0; overflow-wrap:anywhere; }\n'+
  '#chatLog > div { margin-bottom:5px; }\n'+
  '#chatLog .ct { color:#55ffff; margin-right:.5em; }\n'+
  '#chatLog .cn { color:yellow; }\n'+
  '#chatLog .mine .cn { color:#55ff55; }\n'+
  '#chatLog .cg { color:#aaaaaa; margin-right:.5em; }\n'+
  '#chatLog .ce { color:#ff5555; }\n'+
  '#chatLog .cnone { color:#aaaaaa; }\n'+
  '#chatBar { display:flex; gap:8px; flex:0 0 auto; }\n'+
  '#chatBar input { min-width:0; height:var(--ctlh); font-family:inherit; font-size:12px; color:#000; background:#fff; border:2px solid #fff; outline:2px solid #000; padding:4px 6px; }\n'+
  '#chatNick { flex:0 0 8em; }\n'+
  '#chatText { flex:1 1 auto; }\n'+
  '#chatBar button { width:auto; height:var(--ctlh); }\n'+
  '#chatNote { flex:0 0 auto; color:var(--blue); font-size:11px; line-height:1.1; }\n';
const HTML=
  '<div id="chatOverlay" class="overlay" role="dialog" aria-label="Chat">'+
  '<div class="win" id="chatWin" data-title="Chat">'+
  '<span class="close" id="chatClose" title="Close">[X]</span>'+
  '<div id="chatTop"><div id="chatStatus" role="status">Connecting...</div>'+
  '<button id="chatMute" type="button" aria-pressed="false" title="Mute or'+
  ' unmute the unread count on the Menu and in the tab\'s title, and the'+
  ' browser\'s notifications">Mute</button></div>'+
  '<div id="chatLog" role="log"></div>'+
  '<form id="chatBar">'+
  '<input id="chatNick" type="text" aria-label="Your name"'+
  ' autocomplete="nickname" spellcheck="false">'+
  '<input id="chatText" type="text" placeholder="Say something..."'+
  ' aria-label="Message" autocomplete="off">'+
  '<button id="chatSend" type="submit" disabled>Send</button></form>'+
  '<div id="chatNote">Everyone on the site can read this, and the last '+KEEP+
  ' messages are kept. Be kind.</div></div></div>';
WinAdd(CSS,HTML);

const WHY={slow:"Slow down: wait a few seconds, then send it again.",
  repeat:"You just said that.",empty:"There was nothing to send."};
const TITLE=document.title,SEEN_KEY="tos-chat-seen",MUTE_KEY="tos-chat-mute";
let ov=$("chatOverlay"),log=$("chatLog"),status=$("chatStatus"),
  send_btn=$("chatSend"),nick_in=$("chatNick"),text_in=$("chatText"),
  mute_btn=$("chatMute"),cnt_el=$("chatUnread"),chat=null,my_tag="",
  pending="",seen=Number(Load(SEEN_KEY)) || 0,last_n=0,unread=new Set,
  muted=Load(MUTE_KEY)=="1",asked=false;

function Load(key)
{//localStorage can be missing or throw (private windows, blocked storage).
  try {
    return localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

function Save(key,val)
{
  try {
    localStorage.setItem(key,val);
  } catch (e) {
  }
}

function CntShow()
{//The unread count, on the Menu's Chat button and in the tab's title.
  let n=unread.size,s="";
  if (muted)
    n=0;
  if (n>99)
    s="(99+)";
  else if (n)
    s="("+n+")";
  if (s) {
    cnt_el.textContent=" "+s;
    document.title=s+" "+TITLE;
  } else {
    cnt_el.textContent="";
    document.title=TITLE;
  }
}

function Looking()
{//The window is open in the tab the visitor is using.
  return ov.classList.contains("open") && !document.hidden &&
    document.hasFocus();
}

function SeenAll()
{
  seen=last_n;
  Save(SEEN_KEY,String(seen));
  unread.clear();
  CntShow();
}

function Cnt(m)
{//Counts someone else's message that came after the last look.
  if (m.tag==my_tag || m.n<=seen)
    return false;
  unread.add(m.n);
  CntShow();
  return true;
}

function Span(cls,text)
{
  let s=document.createElement("span");
  s.className=cls;
  s.textContent=text;
  return s;
}

function LineMake(m)
{
  let d=document.createElement("div");
  if (m.tag==my_tag)
    d.className="mine";
  d.dataset.n=m.n;
  d.title=new Date(m.at).toLocaleString();
  d.append(Span("ct",stamp(m.at)),Span("cn",m.nick),Span("cg","#"+m.tag),
    Span("cx",m.text));
  return d;
}

function LogAdd(el,stick)
{
  log.querySelector(".cnone")?.remove();
  log.appendChild(el);
  while (log.childElementCount>KEEP)
    log.firstElementChild.remove();
  if (stick)
    log.scrollTop=log.scrollHeight;
}

function Nobody()
{
  let d=document.createElement("div");
  d.className="cnone";
  d.textContent="Nobody has said anything yet.";
  log.appendChild(d);
}

function Note(text)
{
  let d=document.createElement("div");
  d.className="ce";
  d.textContent=text;
  LogAdd(d,true);
}

function NotifyClick(e)
{
  e?.target?.close();
  window.focus();
  Open(false);
}

async function NotifyShow(opts)
{
  let n,reg;
  try {
    n=new Notification("TempleOS chat",opts);
    n.onclick=NotifyClick;
  } catch (e) {//Android shows one only from a service worker.
    await navigator.serviceWorker.register("ChatSw.js");
    reg=await navigator.serviceWorker.ready;
    await reg.showNotification("TempleOS chat",opts);
  }
}

function Notify(m)
{//The browser's notification, while the visitor is in another tab or app.
  if (muted || !window.Notification || Notification.permission!="granted" ||
      !document.hidden && document.hasFocus())
    return;
  NotifyShow({body:m.nick+": "+m.text,tag:"tos-chat",
    icon:"assets/Logo128x152.jpg"}).catch(console.error);
}

function PermAsk()
{//Asked on a click: when the window first opens, and on unmuting.
  let p;
  if (window.Notification && Notification.permission=="default") {
    p=Notification.requestPermission();
    if (p)
      p.catch(console.error);
  }
}

function Hear(e)
{//One event from the chat Worker (checked by chat.js).
  let m,near;
  if (e.t=="hello") {
    my_tag=e.tag;
    log.textContent="";
    last_n=0;
    for (m of e.log) {
      LogAdd(LineMake(m),false);
      last_n=Math.max(last_n,m.n);
    }
    if (!e.log.length)
      Nobody();
    log.scrollTop=log.scrollHeight;
    status.textContent="In chat: "+e.people;
    send_btn.disabled=false;
    if (Load(SEEN_KEY)==null || seen>last_n)
      SeenAll();//A first visit, or a room started again, has none unread.
    unread.clear();
    for (m of e.log)
      Cnt(m);
    if (Looking())
      SeenAll();
    CntShow();
  } else if (e.t=="msg") {
    if (e.n<=last_n)
      return;
    near=log.scrollHeight-log.scrollTop-log.clientHeight<24;
    LogAdd(LineMake(e),near || e.tag==my_tag);
    last_n=Math.max(last_n,e.n);
    if (Looking())
      SeenAll();
    else if (Cnt(e))
      Notify(e);
  } else if (e.t=="people")
    status.textContent="In chat: "+e.n;
  else if (e.t=="del") {
    log.querySelector('[data-n="'+e.n+'"]')?.remove();
    unread.delete(e.n);
    CntShow();
  } else if (e.t=="clear") {
    log.textContent="";
    Nobody();
    last_n=0;
    SeenAll();
  } else if (e.t=="err") {
    Note(WHY[e.why] || "The chat did not take that message.");
    if (pending && !text_in.value)
      text_in.value=pending;
  } else if (e.t=="offline") {
    status.textContent="Offline, trying again...";
    send_btn.disabled=true;
  }
}

function Send(e)
{
  let said=text_in.value.trim();
  e.preventDefault();
  if (!said)
    return;
  if (!chat.say(nick_in.value.trim(),said)) {
    Note("Not connected yet: wait a moment, then send it again.");
    return;
  }
  pending=said;
  text_in.value="";
}

function MuteShow()
{
  if (muted)
    mute_btn.textContent="Unmute";
  else
    mute_btn.textContent="Mute";
  mute_btn.setAttribute("aria-pressed",String(muted));
}

function MuteClick()
{
  muted=!muted;
  Save(MUTE_KEY,muted ? "1" : "0");
  MuteShow();
  CntShow();
  if (!muted)
    PermAsk();
}

function Open(ask=true)
{
  ov.classList.add("open","free");
  WinFocus($("chatWin"));
  if (ask && !asked && !muted)
    PermAsk();
  if (ask)
    asked=true;
  SeenAll();
  chat.wake();
  if (!document.body.classList.contains("touch"))
    text_in.focus({preventScroll:true});
}

function Close()
{
  ov.classList.remove("open","free");
}

function Back()
{//The visitor came back to the tab.
  if (!document.hidden)
    chat.wake();
  if (Looking())
    SeenAll();
}

function NickSave()
{
  saveNick(nick_in.value.trim());
}

function Start()
{//A Worker on this machine (cd chat && npx wrangler dev) with ?chat=URL,
//only for a page served from it too.
  let local=["localhost","127.0.0.1"].includes(location.hostname) &&
    new URLSearchParams(location.search).get("chat"),opts={};
  if (local)
    opts.url=local;
  chat=createChat(Hear,opts);
  chat.wake();
}

nick_in.maxLength=MAX_NICK;
nick_in.placeholder=DEFAULT_NICK;
nick_in.value=savedNick();
text_in.maxLength=MAX_TEXT;
MuteShow();
$("chatClose").addEventListener("click",Close);
$("chatBar").addEventListener("submit",Send);
mute_btn.addEventListener("click",MuteClick);
nick_in.addEventListener("change",NickSave);
Start();
document.addEventListener("visibilitychange",Back);
addEventListener("focus",Back);
addEventListener("online",chat.wake);
navigator.serviceWorker?.addEventListener("message",function (e) {
  if (e.data?.cmd=="chat-open")
    Open(false);
});
if (new URLSearchParams(location.search).get("open")=="chat")
  Open(false);
export {Open};
