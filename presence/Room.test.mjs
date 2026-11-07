//The presence Worker and its Room under node, with RoomFake.mjs for the
//runtime: who may join, the count, PING, the sweep and a full room.
//  node presence/Room.test.mjs
import assert from "node:assert/strict";
import {AlarmRun,JoinReq,Ns,PageClose,PageSend} from "./RoomFake.mjs";
import {PING,PING_MS,PONG,STALE_MS} from "./RoomGlbls.js";

const {Room,default:WORKER}=await import("./Room.js");
const URL_ID="https://presence.test/?id=";
const A="a".repeat(32),B="b".repeat(32),C="c".repeat(32);
let clock=1800000000000;

function ClockNow()
{
  return clock;
}

function EnvNew()
{
  let env={ORIGINS:"https://a.test, http://localhost:8080"};
  env.ROOM=new Ns(Room,env);
  return env;
}

function RoomOne(env)
{
  assert.equal(env.ROOM.objs.size,1,"Every page joins the one room");
  return env.ROOM.objs.values().next().value;
}

async function Status(env,req)
{
  return (await WORKER.fetch(req,env)).status;
}

async function Join(env,id)
{//The room's end of a new page's socket.
  let res=await WORKER.fetch(JoinReq(URL_ID+id,"https://a.test","1.2.3.4"),
	env);
  assert.equal(res.status,101);
  return res.webSocket.peer;
}

function Got(ws)
{//What the page has been sent since it was last asked.
  let res=ws.sent.slice(ws.read ?? 0);
  ws.read=ws.sent.length;
  return res;
}

Date.now=ClockNow;

{
  let id,env=EnvNew();
  assert.equal(await Status(env,JoinReq(URL_ID+A,"https://b.test","1.2.3.4")),
	403,"A page on another site is refused");
  assert.equal(await Status(env,new Request(URL_ID+A,
	{headers:{Upgrade:"websocket"}})),403,"So is one with no Origin");
  assert.equal(await Status(env,new Request(URL_ID+A,
	{headers:{Origin:"https://a.test"}})),426,"Only a WebSocket gets in");
  for (id of ["","A".repeat(32),"a".repeat(31),"a".repeat(33),"g".repeat(32)])
    assert.equal(await Status(env,JoinReq(URL_ID+id,"https://a.test",
	  "1.2.3.4")),400,"A browser id is 32 lowercase hex digits");
  assert.equal(await Status(env,JoinReq(URL_ID+A,"http://localhost:8080",
	"1.2.3.4")),101,"Every page ORIGINS lists may join");
  delete env.ORIGINS;
  assert.equal(await Status(env,JoinReq(URL_ID+A,"https://a.test","1.2.3.4")),
	403,"With no ORIGINS set, no page may join");
}

{
  let room,a,b,a2,c,env=EnvNew();
  a=await Join(env,A);
  assert.deepEqual(Got(a),["1"],"The first page is told it is alone");
  b=await Join(env,B);
  assert.deepEqual(Got(a),["2"],"Everyone hears of a new browser");
  assert.deepEqual(Got(b),["2"],"and the newcomer gets the count");
  a2=await Join(env,A);
  assert.deepEqual(Got(a2),["2"],"A second tab is told the count,");
  assert.deepEqual(Got(a).concat(Got(b)),[],"but it is not a second person");
  room=RoomOne(env);
  PageClose(room,b,1000);
  assert.equal(b.code,1000,"A page that leaves gets a clean close back");
  assert.deepEqual(Got(a),["1"],"and the others hear of it");
  assert.deepEqual(Got(a2),["1"]);
  PageClose(room,a2,1001);
  assert.deepEqual(Got(a),[],"Closing one of two tabs changes no count");
  PageSend(room,a,PING);
  assert.deepEqual(Got(a),[PONG],"PING is answered with PONG");
  c=await Join(env,C);
  assert.deepEqual(Got(a),["2"]);
  c.readyState=WebSocket.CLOSED;
  room.webSocketClose(c,1000,"",true);
  assert.deepEqual(Got(a),["1"],"A close already answered is no error");
  PageSend(room,a,"hello");
  assert.equal(a.code,1008,"Anything but PING closes the socket");
}

{
  let room,quiet,live,hidden,start=clock,quiet_at=null,env=EnvNew();
  quiet=await Join(env,A);
  room=RoomOne(env);
  assert.ok(room.ctx.storage.alarm>clock,"The first page starts the sweep");
  live=await Join(env,B);
  hidden=await Join(env,C);
  while (clock-start<600000) {
    clock+=PING_MS;
    PageSend(room,live,PING);
    if ((clock-start)%60000==0)
      PageSend(room,hidden,PING);
    if (room.ctx.storage.alarm!=null && room.ctx.storage.alarm<=clock)
      await AlarmRun(room);
    if (quiet_at==null && quiet.readyState==WebSocket.CLOSED)
      quiet_at=clock-start;
  }
  assert.equal(quiet.code,1001,"A page that stops pinging is closed");
  assert.ok(STALE_MS<quiet_at && quiet_at<=STALE_MS+120000,
	"once STALE_MS has passed, within two minutes");
  assert.equal(Got(live).filter(Number).at(-1),"2","and the count drops");
  assert.equal(live.readyState,WebSocket.OPEN,"A page that pings stays");
  assert.equal(hidden.readyState,WebSocket.OPEN,
	"and so does a hidden tab whose timers fire once a minute");
  PageClose(room,live,1000);
  PageClose(room,hidden,1000);
  await AlarmRun(room);
  assert.equal(room.ctx.storage.alarm,null,"With no one left the sweep stops");
  await Join(env,A);
  assert.ok(room.ctx.storage.alarm>clock,"and the next page starts it again");
}

{
  let room,env=EnvNew();
  await Join(env,A);
  room=RoomOne(env);
  while (room.ctx.sockets.length<32768)
    room.ctx.acceptWebSocket(new WebSocketPair()[1],[]);
  assert.equal(await Status(env,JoinReq(URL_ID+B,"https://a.test","1.2.3.4")),
	503,"A room says it is full before the runtime's 32768 sockets");
}

console.log("presence room: ok");
