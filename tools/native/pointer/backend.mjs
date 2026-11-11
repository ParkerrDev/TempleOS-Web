import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {resolve,join} from "node:path";
import {readFileSync,writeFileSync} from "node:fs";
import {SnapshotOpen} from "../../../engine/Snapshot.js";
import {Child,Diagnose,Close,directory} from "./Harness.mjs";
const normal=join(directory,"capture.hemu"),fault=join(directory,"fault.hemu"),saved=join(directory,"saved.hemu"),bad=join(directory,"bad.hemu");
const input=process.env.HEMU_NATIVE_FIXTURE||resolve("build/native/TempleOS.hemu");
writeFileSync(bad,"invalid");
try {
  const preparation=spawnSync(resolve("build/native/pointer/backend/pointer-backend"),["prepare",input,normal,fault],
    {env:{...process.env,QT_QPA_PLATFORM:"offscreen"},encoding:"utf8",timeout:120000});
  assert.equal(preparation.status,0,preparation.stderr+preparation.stdout);
  const server=Child("server",{QT_QPA_PLATFORM:"offscreen"});await server.wait(e=>e.event==="ready",0);
  const client=Child("backend",{QT_QPA_PLATFORM:"wayland"});await client.wait(e=>e.event==="ready",0);
  await server.wait(e=>e.event==="surface",0);await client.wait(e=>e.event==="focus"&&e.active,0);
  async function Command(child,message,predicate){const at=child.events.length;child.send(message);return child.wait(predicate,at);}
  const State=p=>e=>e.event==="state"&&p(e);
  let generation=0;
  async function Open(path){
    const busy=await Command(client,{cmd:"open",path},State(s=>s.busy));generation=client.events.indexOf(busy);
    return client.wait(State(s=>s.ready&&!s.busy),generation+1);
  }
  async function Resume(){await Command(client,{cmd:"pause"},State(s=>!s.paused&&s.wanted));}
  async function Capture(){const at=client.events.length;await Command(server,{cmd:"click"},e=>e.event==="lock-request");return client.wait(State(s=>s.captured),at);}
  let state=await Open(normal);assert.equal(state.paused,true);assert.equal(state.captured,false);
  await Resume();await Capture();
  let at=client.events.length;server.send({cmd:"delta",dx:13.25,dy:-7.5});
  const moved=await client.wait(e=>e.event==="mouse"&&e.dx===13.25,at);assert.equal(moved.dy,-7.5);assert.equal(moved.relative,true);
  await client.wait(e=>e.event==="frame",client.events.length);
  // Saving releases the host lease before serializing; the existing logical input schema stays intact.
  at=server.events.length;await Command(client,{cmd:"save",path:saved},State(s=>!s.busy&&s.status.startsWith("Saved ")));
  await server.wait(e=>e.event==="lock-destroyed",at);
  const savedState=await SnapshotOpen(new Uint8Array(readFileSync(saved)),{busProtocol:0});
  assert.equal(savedState.meta.pointer.relative,false);assert.equal(savedState.meta.pointer.b,0);await savedState.Close();
  const inspection=spawnSync(resolve("build/native/pointer/backend/pointer-backend"),["inspect",saved],{env:{...process.env,QT_QPA_PLATFORM:"offscreen"},encoding:"utf8",timeout:30000});
  assert.equal(inspection.status,0,inspection.stderr+inspection.stdout);
  for(const [first,second]of [[29,56],[56,29]]) {
    await Capture();at=client.events.length;server.send({cmd:"key",code:first,down:true});
    await client.wait(e=>e.event==="key"&&e.code===first&&e.down,at);
    at=client.events.length;server.send({cmd:"key",code:second,down:true});await client.wait(State(s=>!s.captured),at);
    assert.ok(client.events.slice(at).some(e=>e.event==="keys-released"),"Ctrl+Alt must also release the guest keys");
    at=client.events.length;server.send({cmd:"key",code:second,down:false});server.send({cmd:"key",code:first,down:false});
    await client.wait(e=>e.event==="native-key"&&!e.down&&e.scan===first+8,at);
  }
  await Capture();at=server.events.length;await Command(client,{cmd:"pause"},State(s=>s.paused&&!s.captured));await server.wait(e=>e.event==="lock-destroyed",at);
  await Resume();await Capture();at=client.events.length;server.send({cmd:"blur"});await client.wait(State(s=>!s.captured),at);
  at=client.events.length;server.send({cmd:"focus"});await client.wait(e=>e.event==="focus"&&e.active,at);
  await Capture();at=server.events.length;state=await Open(bad);assert.equal(state.paused,true);assert.equal(state.captured,false);assert.equal(state.path,normal);await server.wait(e=>e.event==="lock-destroyed",at);
  state=await Open(saved);assert.equal(state.captured,false,"loading a logical pointer state must not acquire a compositor lease");
  if(state.paused)await Resume();else await client.wait(State(s=>!s.busy&&s.wanted),generation);
  await Capture();at=server.events.length;state=await Open(fault);assert.equal(state.captured,false);await server.wait(e=>e.event==="lock-destroyed",at);
  await Resume();await Capture();at=server.events.length;
  state=await client.wait(State(s=>s.fault&&!s.captured));assert.equal(state.paused,true);assert.match(state.status,/CPU 0 stopped/);await server.wait(e=>e.event==="lock-destroyed",at);
  console.log("Actual native HEMU/Qt/Wayland: click capture, fractional movement delivery, save/reopen, Ctrl+Alt, pause, focus, failed/successful replacement and retained CPU fault release passed.");
} catch(error){Diagnose();throw error;} finally {await Close();}
