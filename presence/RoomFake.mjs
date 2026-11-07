//The Workers runtime as far as the rooms use it, in memory under node, for
//their tests: "cloudflare:workers", WebSocketPair, a Durable Object's ctx
//with hibernating sockets, its alarm and SQL storage, a namespace and a 101
//Response. Import this, then the room with await import().
import {timingSafeEqual} from "node:crypto";
import {registerHooks} from "node:module";
import {DatabaseSync} from "node:sqlite";

const WORKERS="data:text/javascript,export class DurableObject{"+
	"constructor(ctx,env){this.ctx=ctx;this.env=env;}}";

function WorkersResolve(spec,ctx,next)
{
  if (spec=="cloudflare:workers")
    return {url:WORKERS,shortCircuit:true};
  return next(spec,ctx);
}

class Socket
{//One end of a WebSocketPair. sent holds what this end sent.
  constructor()
  {
    this.readyState=WebSocket.OPEN;
    this.sent=[];
    this.code=null;
    this.heard=null;
  }

  send(text)
  {
    if (this.readyState!=WebSocket.OPEN)
      throw new Error("send on a closed socket");
    this.sent.push(text);
  }

  close(code)
  {
    if (this.readyState==WebSocket.CLOSED)
      throw new Error("close on a closed socket");
    this.readyState=WebSocket.CLOSED;
    this.code=code;
  }

  serializeAttachment(v)
  {
    this.attach=structuredClone(v);
  }

  deserializeAttachment()
  {
    return structuredClone(this.attach);
  }
}

class Pair
{//[0] goes to the page and [1] stays in the room: [0].peer is [1].
  constructor()
  {
    this[0]=new Socket;
    this[1]=new Socket;
    this[0].peer=this[1];
  }
}

class AutoPair
{
  constructor(request,response)
  {
    this.request=request;
    this.response=response;
  }
}

class Response101 extends Response
{//The runtime's Response takes 101 and a webSocket; node's refuses 101.
  constructor(body,init)
  {
    if (init?.status==101) {
      super(null);
      Object.defineProperty(this,"status",{value:101});
      this.webSocket=init.webSocket;
    } else
      super(body,init);
  }
}

class Cursor
{
  constructor(rows)
  {
    this.rows=rows;
  }

  toArray()
  {
    return this.rows;
  }

  one()
  {
    if (this.rows.length!=1)
      throw new Error("not one row");
    return this.rows[0];
  }
}

function RowPlain(row)
{
  return {...row};
}

export class Sql
{//ctx.storage.sql over node:sqlite; a test can look into db.
  constructor()
  {
    this.db=new DatabaseSync(":memory:");
  }

  exec(query,...args)
  {
    if (query.includes(";")) {
      this.db.exec(query);
      return new Cursor([]);
    }
    return new Cursor(this.db.prepare(query).all(...args).map(RowPlain));
  }
}

class Storage
{//alarm is the time the alarm is set for, or null.
  constructor(sql)
  {
    this.sql=sql;
    this.alarm=null;
  }

  async getAlarm()
  {
    return this.alarm;
  }

  async setAlarm(at)
  {
    this.alarm=at;
  }
}

class Ctx
{
  constructor(sql)
  {
    this.sockets=[];
    this.auto=null;
    this.storage=new Storage(sql);
  }

  acceptWebSocket(ws,tags)
  {
    ws.tags=tags ?? [];
    this.sockets.push(ws);
  }

  getWebSockets(tag)
  {
    let ws,res=[];
    for (ws of this.sockets)
      if (ws.readyState!=WebSocket.CLOSED &&
	    (tag==undefined || ws.tags.includes(tag)))
	res.push(ws);
    return res;
  }

  setWebSocketAutoResponse(pair)
  {
    this.auto=pair;
  }

  getWebSocketAutoResponseTimestamp(ws)
  {
    return ws.heard;
  }
}

export function RoomNew(cls,env,sql)
{
  return new cls(new Ctx(sql ?? new Sql),env);
}

export class Ns
{//A namespace: one object of cls for each name, made when first asked for.
  constructor(cls,env)
  {
    this.cls=cls;
    this.env=env;
    this.objs=new Map();
  }

  getByName(name)
  {
    if (!this.objs.has(name))
      this.objs.set(name,RoomNew(this.cls,this.env));
    return this.objs.get(name);
  }
}

export function JoinReq(url,origin,ip)
{
  return new Request(url,{headers:{Origin:origin,Upgrade:"websocket",
	"CF-Connecting-IP":ip}});
}

export function PageSend(room,ws,msg)
{//As the runtime does: the auto-response answers without the room waking.
  if (room.ctx.auto?.request==msg) {
    ws.send(room.ctx.auto.response);
    ws.heard=new Date(Date.now());
  } else
    room.webSocketMessage(ws,msg);
}

export function PageClose(room,ws,code)
{
  ws.readyState=WebSocket.CLOSING;
  room.webSocketClose(ws,code,"",true);
}

export function AlarmRun(room)
{
  room.ctx.storage.alarm=null;
  return room.alarm();
}

function SafeEqual(a,b)
{
  return timingSafeEqual(new Uint8Array(a),new Uint8Array(b));
}

registerHooks({resolve:WorkersResolve});
globalThis.WebSocketPair=Pair;
globalThis.WebSocketRequestResponsePair=AutoPair;
globalThis.Response=Response101;
crypto.subtle.timingSafeEqual=SafeEqual;
