//templeosweb-presence, behind "Visitors" in the site's top bar:
//  wss://templeosweb-presence.parkerrhunt.workers.dev/?id=<browser id>
//Every open page holds one WebSocket here (presence.js). The one Room tells
//each page how many browsers are connected whenever that changes. Its sockets
//hibernate, so it sleeps between joins and leaves and someone sitting on the
//page costs nothing. The id only stops one person's tabs counting twice: it
//lives on the socket and goes with it, and nothing about a visitor is stored.
//It is apart from templeosweb-files so that nothing here can reach the disk
//image or the games. The chat room is this room with a log (chat/ChatRoom.js).
//  deploy: cd presence && npx wrangler deploy
import {DurableObject} from "cloudflare:workers";
import {ID,PING,PONG,STALE_MS} from "./RoomGlbls.js";

const SOCKETS_MAX=10000; //The runtime allows 32768; every change goes to all.
const SWEEP_MS=60000;

export function Fail(status,text)
{
  return new Response(text,{status});
}

export function Send(ws,text)
{//Sending on a socket that has just closed throws.
  try {
    ws.send(text);
  } catch {}
}

function SocketOpen(ws)
{
  return ws.readyState==WebSocket.OPEN;
}

function OriginOk(origins,origin)
{//ORIGINS lists the pages that may connect, comma separated.
  let o;
  for (o of String(origins ?? "").split(","))
    if (o.trim() && o.trim()==origin)
      return true;
  return false;
}

export function RoomFetch(req,env)
{//Pages from ORIGINS join the one room with their browser id.
  if (!OriginOk(env.ORIGINS,req.headers.get("Origin")))
    return Fail(403,"forbidden");
  if (req.headers.get("Upgrade")!="websocket")
    return Fail(426,"expected a websocket");
  if (!ID.test(new URL(req.url).searchParams.get("id")))
    return Fail(400,"bad id");
  return env.ROOM.getByName("site").fetch(req);
}

export class Room extends DurableObject
{
  constructor(ctx,env)
  {
    super(ctx,env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING,PONG));
  }

  SocketsOpen()
  {
    return this.ctx.getWebSockets().filter(SocketOpen);
  }

  PeopleCnt()
  {//Browsers, not sockets.
    let ws,ids=new Set();
    for (ws of this.SocketsOpen())
      ids.add(ws.deserializeAttachment().id);
    return ids.size;
  }

  PeopleMsg(n)
  {
    return String(n);
  }

  SendAll(text)
  {
    let ws;
    for (ws of this.SocketsOpen())
      Send(ws,text);
  }

  PeopleSend(joined)
  {//To all when the count has changed, else to a socket that just joined.
    let n=this.PeopleCnt();
    if (n!=this.said) {
      this.said=n; //Lost when the room sleeps: all get a number they have.
      this.SendAll(this.PeopleMsg(n));
    } else if (joined)
      Send(joined,this.PeopleMsg(n));
  }

  Accept(attach,tags)
  {//A new socket pair: the room keeps [1], the page gets [0].
    let pair=new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1],tags);
    attach.since=Date.now();
    pair[1].serializeAttachment(attach);
    return pair;
  }

  async Joined(pair)
  {//The sweep runs only while someone is connected.
    if (!await this.ctx.storage.getAlarm())
      await this.ctx.storage.setAlarm(Date.now()+SWEEP_MS);
    return new Response(null,{status:101,webSocket:pair[0]});
  }

  async fetch(req)
  {
    let pair;
    if (this.ctx.getWebSockets().length>=SOCKETS_MAX)
      return Fail(503,"full");
    pair=this.Accept({id:new URL(req.url).searchParams.get("id")});
    this.PeopleSend(pair[1]);
    return this.Joined(pair);
  }

  webSocketMessage(ws)
  {//Pages only send PING, which the runtime answers before this could run.
    ws.close(1008,"pings only");
    this.PeopleSend();
  }

  webSocketClose(ws)
  {//The runtime does not answer a page's close on a hibernating socket, even
    //at this compatibility date, and the page would wait 10 s for a close that
    //ends abnormally (tools/chat-worker.test.mjs times it).
    try {
      ws.close(1000,"bye");
    } catch {}
    this.PeopleSend();
  }

  webSocketError()
  {
    this.PeopleSend();
  }

  async alarm()
  {//A page that vanished (a laptop shut, a lost network) sends no close.
    let ws,heard,now=Date.now();
    for (ws of this.SocketsOpen()) {
      heard=this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() ??
	    ws.deserializeAttachment().since;
      if (now-heard>STALE_MS)
	ws.close(1001,"silent");
    }
    this.PeopleSend();
    if (this.SocketsOpen().length)
      await this.ctx.storage.setAlarm(now+SWEEP_MS);
  }
}

export default {fetch:RoomFetch};
