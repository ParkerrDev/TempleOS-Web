//The chat Worker and its ChatRoom under node, with ../presence/RoomFake.mjs
//for the runtime: joining, what is said and kept, the limits, what is never
//stored, and moderation.
//  node chat/ChatRoom.test.mjs
import assert from "node:assert/strict";
import {JoinReq,Ns,PageClose,PageSend,RoomNew,Sql}
	from "../presence/RoomFake.mjs";
import {PING,PONG} from "../presence/RoomGlbls.js";
import {BURST,FORGET_MS,KEEP,MAX_FRAME,REFILL_MS,REPEAT_MS} from "./rules.js";

const {ChatRoom,default:WORKER}=await import("./ChatRoom.js");
const URL_ID="https://chat.test/?id=";
const IDS=["0","1","2","3","4","5","6","7","8","9"].map(IdMk);
let clock=1800000000000;

function IdMk(digit)
{
  return digit.repeat(32);
}

function ClockNow()
{
  return clock;
}

function EnvNew(token)
{
  let env={ORIGINS:"https://a.test",ADMIN_TOKEN:token};
  env.ROOM=new Ns(ChatRoom,env);
  return env;
}

function RoomOne(env)
{
  assert.equal(env.ROOM.objs.size,1,"Every page joins the one room");
  return env.ROOM.objs.values().next().value;
}

async function Join(env,id,ip)
{//The room's end of a new page's socket, or the status that refused it.
  let res=await WORKER.fetch(JoinReq(URL_ID+id,"https://a.test",
	ip ?? "1.2.3.4"),env);
  if (res.status!=101)
    return res.status;
  return res.webSocket.peer;
}

function Got(ws)
{//What the page has been sent since it was last asked.
  let res=ws.sent.slice(ws.read ?? 0);
  ws.read=ws.sent.length;
  return res.map(JSON.parse.bind(JSON));
}

function TextOf(msg)
{
  return msg.text;
}

function Say(room,ws,nick,text)
{
  PageSend(room,ws,JSON.stringify({t:"say",nick,text}));
}

async function Admin(env,body,auth,method)
{//The status and text of a request to /admin.
  let res=await WORKER.fetch(new Request("https://chat.test/admin",
	{method:method ?? "POST",headers:{Authorization:auth ?? "Bearer tok"},
	body}),env);
  return [res.status,await res.text()];
}

function Stored(sql)
{//Every row of every table, as text.
  let t,res="";
  for (t of sql.db.prepare("SELECT name FROM sqlite_master WHERE"+
	" type = 'table'").all())
    res+=JSON.stringify(sql.db.prepare("SELECT * FROM "+t.name).all());
  return res;
}

Date.now=ClockNow;

{
  let room,a,b,a2,ws,i,hello,tags=new Set,sent="",env=EnvNew();
  a=await Join(env,IDS[0]);
  room=RoomOne(env);
  [hello]=Got(a);
  assert.match(hello.tag,/^[0-9a-f]{4}$/,"A page is given a four-digit tag");
  assert.deepEqual(hello,{t:"hello",tag:hello.tag,people:1,log:[]});
  assert.deepEqual(a.sent.map(JSON.parse.bind(JSON)).at(-1),{t:"people",n:1});
  b=await Join(env,IDS[1]);
  assert.equal(Got(b)[0].people,2,"A newcomer is told how many are here");
  assert.deepEqual(Got(a),[{t:"people",n:2}],"and everyone hears of them");
  a2=await Join(env,IDS[0]);
  assert.equal(Got(a2)[0].tag,hello.tag,"A browser's tabs share its tag");
  assert.deepEqual(Got(a),[],"and are not counted twice");
  tags.add(hello.tag);
  for (i=2;i<10;i++)
    tags.add(Got(await Join(env,IDS[i],"10.0.0."+i))[0].tag);
  assert.ok(tags.size>1,"Browsers get different tags,");
  for (i of IDS)
    tags.delete(i.slice(0,4));
  assert.ok(tags.size>1,"which do not give their ids away");
  PageSend(room,a,PING);
  assert.equal(a.sent.at(-1),PONG,"PING is answered with PONG");
  PageClose(room,a2,1000);
  assert.equal(a2.code,1000,"A page that leaves gets a clean close back");
  for (ws of room.ctx.sockets)
    sent+=ws.sent.join("");
  for (i=0;i<10;i++)
    assert.ok(!sent.includes(IDS[i]),"No one is ever sent a browser id");
}

{
  let room,a,b,c,ws,msg,env=EnvNew();
  a=await Join(env,IDS[0]);
  b=await Join(env,IDS[1]);
  room=RoomOne(env);
  msg={t:"msg",n:1,at:clock,nick:"Terry1",tag:Got(a)[0].tag,text:"hi there"};
  Got(b);
  Say(room,a,"  Terry#1@ ","hi\u202E  \u0007there");
  assert.deepEqual(Got(a),[msg],"What is said goes to all, cleaned,");
  assert.deepEqual(Got(b),[msg],"with the sender's tag and the time");
  c=await Join(env,IDS[2]);
  delete msg.t;
  assert.deepEqual(Got(c)[0].log,[msg],"and a newcomer is sent the log");
  Got(a);
  Got(b);
  Say(room,a,"","   ");
  assert.deepEqual(Got(a),[{t:"err",why:"empty"}],"Nothing to say is refused");
  Say(room,a,"",42);
  assert.deepEqual(Got(a),[{t:"err",why:"empty"}],"and so is a text not text");
  Say(room,a,null,"x");
  assert.equal(Got(b)[0].nick,"Guest","No name is Guest");
  for (msg of [new ArrayBuffer(8),"x".repeat(MAX_FRAME+1)]) {
    ws=await Join(env,IDS[3]);
    PageSend(room,ws,msg);
    assert.equal(ws.code,1009,"A frame too big or not text closes the socket");
  }
  for (msg of ["not json",'{"t":"hello"}',"[]","null"]) {
    ws=await Join(env,IDS[3]);
    PageSend(room,ws,msg);
    assert.equal(ws.code,1003,"and so does anything but a say");
  }
}

{
  let room,a,b,far,i,env=EnvNew();
  a=await Join(env,IDS[0]);
  b=await Join(env,IDS[1]);
  far=await Join(env,IDS[2],"5.6.7.8");
  room=RoomOne(env);
  Got(a);
  for (i=0;i<BURST;i++)
    Say(room,a,"","m"+i);
  assert.equal(Got(a).length,BURST,"A burst of BURST messages goes out");
  Say(room,a,"","more");
  assert.deepEqual(Got(a),[{t:"err",why:"slow"}],"and then they must wait");
  Say(room,b,"","more");
  assert.deepEqual(Got(b).at(-1),{t:"err",why:"slow"},
	"as must every browser from that address");
  Got(far);
  Say(room,far,"","far");
  assert.equal(Got(far)[0].t,"msg","but not one from another address");
  clock+=REFILL_MS;
  Say(room,a,"","again");
  assert.equal(Got(a)[0].t,"msg","Each REFILL_MS one more may go");
  clock+=REFILL_MS;
  Say(room,a,"","again");
  assert.deepEqual(Got(a),[{t:"err",why:"repeat"}],"but not the same twice");
  Say(room,a,"","other");
  assert.equal(Got(a)[0].t,"msg","and a refused message costs nothing");
  clock+=REPEAT_MS;
  Say(room,a,"","again");
  assert.equal(Got(a)[0].t,"msg","A repeat is fine after REPEAT_MS");
}

{
  let room,a,i,log,env=EnvNew();
  a=await Join(env,IDS[0]);
  room=RoomOne(env);
  for (i=0;i<KEEP+3;i++) {
    clock+=REFILL_MS;
    Say(room,a,"","m"+i);
  }
  log=Got(await Join(env,IDS[1]))[0].log;
  assert.equal(log.length,KEEP,"The room keeps KEEP messages,");
  assert.deepEqual([log[0].text,log.at(-1).text],["m3","m"+(KEEP+2)],
	"the last ones");
}

{
  let room,ws,i,senders,env=EnvNew();
  for (i=0;i<8;i++)
    ws=await Join(env,IDS[i],"9.9.9.9");
  room=RoomOne(env);
  assert.equal(await Join(env,IDS[8],"9.9.9.9"),429,
	"One address may hold 8 sockets");
  PageClose(room,ws,1000);
  assert.notEqual(typeof await Join(env,IDS[8],"9.9.9.9"),"number",
	"and another when one closes");
  for (i=0;i<8;i++)
    await Join(env,IDS[i],"2001:db8:0:1::"+(i+1));
  assert.equal(await Join(env,IDS[8],"2001:db8:0:1:ffff::1"),429,
	"An IPv6 /64 is one address");
  ws=await Join(env,IDS[8],"2001:db8:0:2::1");
  assert.notEqual(typeof ws,"number");
  Say(room,ws,"","hi");
  senders=room.sql.exec("SELECT * FROM sender").toArray().length;
  clock+=FORGET_MS+1;
  ws=await Join(env,IDS[9],"7.7.7.7");
  Say(room,ws,"","hi");
  assert.equal(room.sql.exec("SELECT * FROM sender").toArray().length,senders,
	"A sender is forgotten a minute after their last message");
  for (i of IDS.concat(["9.9.9.9","2001:db8","7.7.7.7","1.2.3.4"]))
    assert.ok(!Stored(room.sql).includes(i),
	  "Neither a browser id nor an address is stored");
}

{
  let r1,r2,a,hello,sql=new Sql,env=EnvNew();
  r1=RoomNew(ChatRoom,env,sql);
  a=(await r1.fetch(JoinReq(URL_ID+IDS[0],"https://a.test","1.2.3.4")))
	.webSocket.peer;
  hello=Got(a)[0];
  Say(r1,a,"","kept");
  r2=RoomNew(ChatRoom,env,sql);
  a=(await r2.fetch(JoinReq(URL_ID+IDS[0],"https://a.test","1.2.3.4")))
	.webSocket.peer;
  assert.equal(Got(a)[0].tag,hello.tag,"A room that wakes keeps the tags");
  assert.equal(a.sent.length,2);
  assert.equal(JSON.parse(a.sent[0]).log[0].text,"kept","and the log");
}

{
  let room,a,env=EnvNew();
  assert.equal((await Admin(env,'{"list":true}'))[0],404,
	"Without ADMIN_TOKEN there is no /admin");
  env=EnvNew("tok");
  a=await Join(env,IDS[0]);
  room=RoomOne(env);
  Say(room,a,"","one");
  clock+=REFILL_MS;
  Say(room,a,"","two");
  Got(a);
  assert.equal((await Admin(env,null,null,"GET"))[0],405,"/admin takes POST");
  assert.equal((await Admin(env,'{"list":true}',"Bearer tok2"))[0],401,
	"and the token");
  assert.deepEqual(JSON.parse((await Admin(env,'{"list":true}',
	"bearer tok"))[1]).map(TextOf),["one","two"],"It lists the log");
  assert.deepEqual(await Admin(env,'{"delete":1}'),[200,'{"deleted":1}'],
	"deletes a message");
  assert.deepEqual(Got(a),[{t:"del",n:1}],"which goes from every page");
  assert.deepEqual(await Admin(env,'{"delete":1}'),[200,'{"deleted":0}']);
  assert.deepEqual(Got(a),[]);
  assert.deepEqual(await Admin(env,'{"clear":true}'),[200,'{"cleared":true}'],
	"and clears the log");
  assert.deepEqual(Got(a),[{t:"clear"}]);
  assert.equal((await Admin(env,'{"list":true}'))[1],"[]");
  for (a of ['{"delete":"1"}','{"list":1}',"not json","{}"])
    assert.equal((await Admin(env,a))[0],400,"Anything else is a 400");
}

{
  let room,env=EnvNew();
  await Join(env,IDS[0]);
  room=RoomOne(env);
  while (room.ctx.sockets.length<32768)
    room.ctx.acceptWebSocket(new WebSocketPair()[1],[]);
  assert.equal(await Join(env,IDS[1]),503,
	"A room says it is full before the runtime's 32768 sockets");
}

console.log("chat room: ok");
