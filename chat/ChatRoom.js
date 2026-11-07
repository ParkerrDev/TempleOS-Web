//templeosweb-chat, behind the site's Chat window:
//  wss://templeosweb-chat.parkerrhunt.workers.dev/?id=<browser id>
//A page opens one WebSocket here the first time someone opens Chat (chat.js).
//The one ChatRoom is the presence room (../presence/Room.js) with a log: it
//keeps the last KEEP messages in its SQLite storage, so whoever joins sees
//what was said.
//
//What is stored: each message's time, name, text and tag. The tag is four hex
//digits of a hash of the browser's id with a salt only this room knows, shown
//after the name so two people called "Guest" can be told apart; the id itself
//is never stored or shown. A sender's IP (or IPv6 /64) is never stored
//either: the room hashes it with the salt as the socket opens and rate limits
//by that hash, which it keeps on the socket while it is open and, in the
//sender table, until a minute after that sender's last message.
//
//Moderation: with the secret ADMIN_TOKEN set (npx wrangler secret put
//ADMIN_TOKEN), POST /admin with "Authorization: Bearer <token>" and one of
//{"list":true}, {"delete":<n>}, {"clear":true}. Without the secret, /admin
//does not exist.
//
//It is apart from templeosweb-presence so that the visitor count keeps
//storing nothing at all.
//  deploy: cd chat && npx wrangler deploy
import {cleanNick,cleanText,FORGET_MS,ipKey,KEEP,limit,MAX_FRAME}
	from "./rules.js";
import {Fail,Room,RoomFetch,Send} from "../presence/Room.js";

const SOCKETS_MAX=5000; //Every message goes to all of them.
const SENDER_SOCKETS_MAX=8; //From one IP (or /64): tabs, not a flood.
const TABLES=
	"CREATE TABLE IF NOT EXISTS msg (n INTEGER PRIMARY KEY AUTOINCREMENT,"+
	" at INTEGER NOT NULL, nick TEXT NOT NULL, tag TEXT NOT NULL,"+
	" text TEXT NOT NULL);"+
	"CREATE TABLE IF NOT EXISTS setting (k TEXT PRIMARY KEY,"+
	" v TEXT NOT NULL);"+
	"CREATE TABLE IF NOT EXISTS sender (k TEXT PRIMARY KEY,"+
	" tokens REAL NOT NULL, at INTEGER NOT NULL, last INTEGER NOT NULL,"+
	" last_at INTEGER NOT NULL)";

function Hex(buf)
{
  let b,res="";
  for (b of new Uint8Array(buf))
    res+=b.toString(16).padStart(2,"0");
  return res;
}

function Sha256(text)
{
  return crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));
}

export class ChatRoom extends Room
{
  constructor(ctx,env)
  {
    super(ctx,env);
    this.sql=ctx.storage.sql;
    this.sql.exec(TABLES);
    this.salt=this.sql.exec("SELECT v FROM setting WHERE k = 'salt'")
	  .toArray()[0]?.v;
    if (!this.salt) {
      this.salt=Hex(crypto.getRandomValues(new Uint8Array(16)));
      this.sql.exec("INSERT INTO setting (k, v) VALUES ('salt', ?)",this.salt);
    }
  }

  PeopleMsg(n)
  {
    return JSON.stringify({t:"people",n});
  }

  Log()
  {
    return this.sql.exec("SELECT n, at, nick, tag, text FROM msg ORDER BY n")
	  .toArray();
  }

  async fetch(req)
  {//A page joins and is sent its tag, the count and the log.
    let pair,sender,tag,id=new URL(req.url).searchParams.get("id");
    if (this.ctx.getWebSockets().length>=SOCKETS_MAX)
      return Fail(503,"full");
    sender=Hex(await Sha256(this.salt+":ip:"+
	  ipKey(req.headers.get("CF-Connecting-IP")))).slice(0,32);
    if (this.ctx.getWebSockets(sender).length>=SENDER_SOCKETS_MAX)
      return Fail(429,"too many");
    tag=Hex(await Sha256(this.salt+":"+id)).slice(0,4);
    pair=this.Accept({id,tag,sender},[sender]);
    Send(pair[1],JSON.stringify({t:"hello",tag,people:this.PeopleCnt(),
	  log:this.Log()}));
    this.PeopleSend();
    return this.Joined(pair);
  }

  SenderLimit(sender,text,now)
  {//Read and written with nothing between, as SQL here does not wait.
    let row,res;
    this.sql.exec("DELETE FROM sender WHERE at < ?",now-FORGET_MS);
    row=this.sql.exec("SELECT tokens, at, last, last_at AS lastAt FROM sender"+
	  " WHERE k = ?",sender).toArray()[0];
    res=limit(row ?? null,text,now);
    this.sql.exec("INSERT OR REPLACE INTO sender (k, tokens, at, last,"+
	  " last_at) VALUES (?, ?, ?, ?, ?)",sender,res.kept.tokens,
	  res.kept.at,res.kept.last,res.kept.lastAt);
    return res.why;
  }

  webSocketMessage(ws,msg)
  {//Besides PING, which never gets here, a page sends {"t":"say",nick,text}.
    let said=null,text,me,at,why,nick,n;
    if (typeof msg!="string" || msg.length>MAX_FRAME) {
      ws.close(1009,"too big");
      return;
    }
    try {
      said=JSON.parse(msg);
    } catch {}
    if (said?.t!=="say") {
      ws.close(1003,"say only");
      return;
    }
    text=cleanText(said.text);
    if (!text) {
      Send(ws,JSON.stringify({t:"err",why:"empty"}));
      return;
    }
    me=ws.deserializeAttachment();
    at=Date.now();
    why=this.SenderLimit(me.sender,text,at);
    if (why) {
      Send(ws,JSON.stringify({t:"err",why}));
      return;
    }
    nick=cleanNick(said.nick);
    n=this.sql.exec("INSERT INTO msg (at, nick, tag, text) VALUES"+
	  " (?, ?, ?, ?) RETURNING n",at,nick,me.tag,text).one().n;
    this.sql.exec("DELETE FROM msg WHERE n <= ?",n-KEEP);
    this.SendAll(JSON.stringify({t:"msg",n,at,nick,tag:me.tag,text}));
  }

  MsgDel(n)
  {
    let res=this.sql.exec("DELETE FROM msg WHERE n = ? RETURNING n",n)
	  .toArray().length;
    if (res)
      this.SendAll(JSON.stringify({t:"del",n}));
    return res;
  }

  LogClear()
  {
    this.sql.exec("DELETE FROM msg");
    this.SendAll(JSON.stringify({t:"clear"}));
  }
}

async function TokenSame(given,token)
{//Both are hashed first, so the compare takes one time whatever is sent.
  let a=await Sha256(given),b=await Sha256(token);
  return crypto.subtle.timingSafeEqual(a,b);
}

async function Admin(req,env,room)
{
  let op=null;
  if (!env.ADMIN_TOKEN)
    return Fail(404,"not found");
  if (req.method!="POST")
    return Fail(405,"POST only");
  if (!await TokenSame((req.headers.get("Authorization") ?? "")
	.replace(/^Bearer\s+/i,""),env.ADMIN_TOKEN))
    return Fail(401,"wrong token");
  try {
    op=await req.json();
  } catch {}
  if (op?.list===true)
    return Response.json(await room.Log());
  if (op?.clear===true) {
    await room.LogClear();
    return Response.json({cleared:true});
  }
  if (Number.isSafeInteger(op?.delete))
    return Response.json({deleted:await room.MsgDel(op.delete)});
  return Fail(400,'send {"list":true}, {"delete":<n>} or {"clear":true}');
}

function ChatFetch(req,env)
{
  if (new URL(req.url).pathname=="/admin")
    return Admin(req,env,env.ROOM.getByName("site"));
  return RoomFetch(req,env);
}

export default {fetch:ChatFetch};
