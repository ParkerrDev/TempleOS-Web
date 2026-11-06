// Chat: the page's side of the Chat window. The first time someone opens it, the page connects to the chat
// Worker (chat/worker.js) and stays connected, so the Menu can count what arrives while the window is shut.
// The browser id is the same one "Visitors" uses (presence.js); the Worker never shows it, only a short tag
// made from it. Everything that comes in is checked here before the page believes it, and the window only
// ever puts it on screen as text. Keeping the socket up is livesocket.js; the limits are chat/rules.js.
import {createLiveSocket} from './livesocket.js';
import {browserId} from './presence.js';
import {KEEP,MAX_NICK,MAX_TEXT} from './chat/rules.js';

export {MAX_NICK,MAX_TEXT};
export const CHAT_URL='wss://templeosweb-chat.parkerrhunt.workers.dev/';
const NICK_KEY='tos-chat-nick';

const whole=(v)=>Number.isSafeInteger(v)&&v>=0;
const text=(v,max)=>typeof v==='string'?v.slice(0,max):null;

function line(m) {
  if(!m||!whole(m.n)||!whole(m.at))return null;
  const nick=text(m.nick,MAX_NICK*2),tag=text(m.tag,8),said=text(m.text,MAX_TEXT*2);
  return nick===null||tag===null||said===null?null:{n:m.n,at:m.at,nick,tag,text:said};
}

// One event from the Worker, or null for anything that is not one.
export function readEvent(data) {
  let e=null;
  try{e=JSON.parse(data);}catch{return null;}
  if(!e||typeof e!=='object')return null;
  if(e.t==='hello'){
    const tag=text(e.tag,8);
    if(tag===null||!whole(e.people)||!Array.isArray(e.log))return null;
    return {t:'hello',tag,people:e.people,log:e.log.slice(-KEEP).map(line).filter(Boolean)};
  }
  if(e.t==='msg'){const m=line(e);return m&&{t:'msg',...m};}
  if(e.t==='people'||e.t==='del')return whole(e.n)?{t:e.t,n:e.n}:null;
  if(e.t==='clear')return {t:'clear'};
  if(e.t==='err')return typeof e.why==='string'?{t:'err',why:e.why.slice(0,16)}:null;
  return null;
}

// `on` hears every event above, plus {t:'offline'} each time the connection is lost. say() is false when
// there is no room to say it in yet.
export function createChat(on,{url=CHAT_URL,id=browserId(),open}={}) {
  let live=false;
  const socket=createLiveSocket(`${url}?id=${id}`,{
    open,
    lost(){live=false;on({t:'offline'});},
    message(data){
      if(data==='pong')return;
      const e=readEvent(data);
      if(!e)return;
      if(e.t==='hello')live=true;
      on(e);
    },
  });
  return {
    wake:socket.wake,
    get live(){return live;},
    say(nick,said){return live&&socket.send(JSON.stringify({t:'say',nick,text:said}));},
  };
}

// "14:05" today, "11/04 14:05" before
export function stamp(at,now=Date.now()) {
  const t=new Date(at),today=new Date(now),p2=(n)=>String(n).padStart(2,'0');
  const time=`${p2(t.getHours())}:${p2(t.getMinutes())}`;
  return t.toDateString()===today.toDateString()?time:`${p2(t.getMonth()+1)}/${p2(t.getDate())} ${time}`;
}

export function savedNick() {
  try{return (localStorage.getItem(NICK_KEY)||'').slice(0,MAX_NICK);}catch{return '';}
}
export function saveNick(nick) {
  try{localStorage.setItem(NICK_KEY,nick);}catch{}
}
