import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

const source=readFileSync(new URL("../ChatSw.js",import.meta.url),"utf8");
for (const open of [false,true]) {
  let click,closed=false,focused=false,message,opened,options;
  const client={url:"https://templeosweb.netlify.app/",
    async focus() {focused=true;},postMessage(m) {message=m;}},
    other={url:"https://templeosweb.netlify.app/player",
      focus() {throw new Error("Must focus the chat page, not another tool.");}};
  runInNewContext(source,{URL,addEventListener(name,fn) {
    assert.equal(name,"notificationclick");click=fn;
  },clients:{
    async matchAll(opts) {options=opts;return open?[other,client]:[other];},
    async openWindow(url) {opened=url;}
  }});
  let done;
  click({notification:{close() {closed=true;}},waitUntil(p) {done=p;}});
  await done;
  assert(closed);
  assert.equal(options.type,"window");
  assert.equal(options.includeUncontrolled,true,
    "A page that registered its first service worker must still be found.");
  if (open) {
    assert(focused);assert.equal(message.cmd,"chat-open");assert.equal(opened,undefined);
  } else {
    assert(!focused);assert.equal(opened,"./?open=chat");
  }
}
console.log("Chat notification click focuses an existing page or opens chat in a new page.");
