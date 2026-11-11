import assert from "node:assert/strict";
import {Child,Diagnose,Close} from "./Harness.mjs";
try {
  const server=Child("server",{QT_QPA_PLATFORM:"offscreen"});await server.wait(e=>e.event==="ready",0);
  const client=Child("client",{QT_QPA_PLATFORM:"wayland"});await client.wait(e=>e.event==="ready",0);
  await server.wait(e=>e.event==="surface",0);await client.wait(e=>e.event==="focus"&&e.active,0);
  async function Command(child,cmd,after){const at=child.events.length;child.send({cmd});return child.wait(after,at);}
  const Active=e=>e.event==="state"&&e.active,Released=e=>e.event==="state"&&!e.active&&!e.pending;
  await Command(client,"capture",Active);
  assert.equal(server.events.find(e=>e.event==="lock-request").lifetime,1);
  let at=client.events.length;server.send({cmd:"delta",dx:13.25,dy:-7.5});assert.deepEqual(await client.wait(e=>e.event==="motion",at),{event:"motion",dx:13.25,dy:-7.5});
  const destroyed=server.events.length;await Command(client,"release",Released);await server.wait(e=>e.event==="lock-destroyed",destroyed);
  await Command(client,"capture",Active);
  at=client.events.length;server.send({cmd:"blur"});await client.wait(Released,at);
  at=client.events.length;server.send({cmd:"focus"});await client.wait(e=>e.event==="focus"&&e.active,at);
  await Command(server,"deny",e=>e.event==="command"&&e.cmd==="deny");
  await Command(client,"capture",e=>e.event==="state"&&e.pending);
  const count=client.events.filter(e=>e.event==="motion").length;
  server.send({cmd:"delta",dx:1.125,dy:2.5});at=client.events.length;server.send({cmd:"activate"});await client.wait(Active,at);
  assert.equal(client.events.filter(e=>e.event==="motion").length,count,"pending capture must discard relative input before locked");
  at=client.events.length;server.send({cmd:"delta",dx:.5,dy:-.25});assert.equal((await client.wait(e=>e.event==="motion",at)).dx,.5);
  at=client.events.length;server.send({cmd:"unlock"});await client.wait(Released,at);
  await Command(client,"capture",e=>e.event==="state"&&e.pending);
  await Command(client,"release",Released);
  at=client.events.length;await Command(client,"capture",e=>e.event==="state"&&e.pending);
  assert.match((await client.wait(e=>e.event==="error",at)).text,/did not grant/);
  assert.ok(client.events.slice(at).some(Released));
  await Command(server,"grant",e=>e.event==="command"&&e.cmd==="grant");
  await Command(client,"capture",Active);await Command(client,"hide",Released);
  await Command(server,"grant",e=>e.event==="command"&&e.cmd==="grant");
  at=server.events.length;await Command(client,"show",e=>e.event==="command"&&e.cmd==="show");await server.wait(e=>e.event==="surface",at);
  await Command(client,"capture",Active);await Command(client,"destroy",Released);
  at=server.events.length;await Command(client,"show",e=>e.event==="command"&&e.cmd==="show");await server.wait(e=>e.event==="surface",at);
  await Command(client,"capture",Active);at=client.events.length;server.send({cmd:"remove"});await client.wait(Released,at);
  assert.match((await Command(client,"capture",e=>e.event==="error")).text,/requires Wayland/);
  console.log("Actual Qt/Wayland protocol: compositor grant, fractional unaccelerated deltas, pending input/cancel/timeout, compositor unlock, release/focus/hide/surface/global teardown and unsupported capture passed.");
 } catch(error) {Diagnose();throw error;} finally {await Close();}
