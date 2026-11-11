//What a chat message may be, for the room (ChatRoom.js) and the page
//(chat.js), so both keep the same limits. It imports nothing, so node tests
//it too (tools/chat.test.mjs).

export const MAX_TEXT=300; //Characters (code points) in a message.
export const MAX_NICK=16; //Characters in a name.
export const MAX_FRAME=4096; //Characters of JSON a page may send at once.
export const KEEP=100; //Messages the room keeps and sends whoever joins.
export const DEFAULT_NICK="Guest";

//Per sender: a burst of BURST messages, then one every REFILL_MS, and never
//the same text twice within REPEAT_MS. The room keeps what limit() returns
//in its storage, as a room that hibernates loses its memory.
export const BURST=5,REFILL_MS=3000,REPEAT_MS=30000;
//A sender quiet this long is the same as someone new (the burst is full and
//the repeat window has passed), so what is kept about them can go.
export const FORGET_MS=60000;

//Bidi overrides and isolates can make a message display as something it does
//not say, and the line and paragraph separators break the one-line layout.
//Other format characters stay: emoji need U+200D and U+FE0F.
const HIDDEN=/[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069\u2028\u2029]/gu;
const CONTROL=/\p{Cc}/gu;
//Three combining marks are enough for any language; more is "Zalgo".
const MARKS=/(\p{M}{3})\p{M}+/gu;
const SPACES=/\s+/gu;

function LineClean(value,max)
{//One line of at most max characters, with nothing that hides what it says.
  let s;
  if (typeof value!="string")
    return "";
  s=value.slice(0,max*8) //Bounds the work on a huge string.
	.normalize("NFC").replace(CONTROL," ").replace(HIDDEN,"")
	.replace(MARKS,"$1").replace(SPACES," ").trim();
  return [...s].slice(0,max).join("").trim();
}

export function cleanText(value)
{
  return LineClean(value,MAX_TEXT);
}

export function cleanNick(value)
{//The page shows the tag after a name as #tag.
  return LineClean(value,MAX_NICK).replace(/[#@]/g,"").trim() || DEFAULT_NICK;
}

function GroupTrim(group)
{
  return group.replace(/^0+(?=.)/,"");
}

export function ipKey(ip)
{//The key a sender is rate limited by. IPv6 users usually hold a whole /64,
  //so it is the first four groups.
  let m,halves,front=[],back=[],zeros=[];
  if (typeof ip!="string" || !ip)
    return "?";
  if (!ip.includes(":"))
    return ip;
  if (m=/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip))
    return m[1]; //IPv4 written as IPv6.
  halves=ip.toLowerCase().split("::");
  if (halves[0])
    front=halves[0].split(":");
  if (halves.length>1) {
    if (halves[1])
      back=halves[1].split(":");
    zeros=Array(Math.max(0,8-front.length-back.length)).fill("0");
  }
  return front.concat(zeros,back).slice(0,4).map(GroupTrim).join(":")+
	"::/64";
}

export function limit(kept,text,now)
{//What kept (null for someone new) says of a message: why it may not go
  //(null, "slow" or "repeat"), and what to keep now.
  let s={tokens:BURST,at:now,last:0,lastAt:0},hash=textHash(text);
  if (kept)
    s={...kept};
  s.tokens=Math.min(BURST,s.tokens+Math.max(0,now-s.at)/REFILL_MS);
  s.at=Math.max(s.at,now);
  if (s.tokens<1)
    return {why:"slow",kept:s};
  if (hash==s.last && now-s.lastAt<REPEAT_MS)
    return {why:"repeat",kept:s};
  s.tokens--;
  s.last=hash;
  s.lastAt=now;
  return {why:null,kept:s};
}

export function textHash(text)
{//32-bit FNV-1a over the UTF-16 units: enough to notice a repeat without
  //keeping what was said.
  let i,h=0x811C9DC5;
  for (i=0;i<text.length;i++)
    h=Math.imul(h^text.charCodeAt(i),0x01000193)>>>0;
  return h;
}
