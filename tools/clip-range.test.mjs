import assert from "node:assert/strict";
import {RangeSource} from "../clip/Range.js";

let requests=[],mode="normal",total=33554440;
globalThis.fetch=async function (url,options) {
  let [first,last]=options.headers.Range.match(/\d+/g).map(Number),headers,body;
  requests.push([first,last]);last=Math.min(last,total-1);
  if (mode=="ignored") return new Response("full file",{status:200});
  headers={"Content-Range":"bytes "+first+"-"+last+"/"+total,
    ETag:'"first"'};
  if (mode=="changed") headers.ETag='"second"';
  if (mode=="wrong") headers["Content-Range"]="bytes 1-10/100";
  body=new Uint8Array(last-first+1);
  if (mode=="truncated") body=body.slice(0,-1);
  if (mode=="overflow") body=new Uint8Array(body.length+1);
  body.fill(7);
  return new Response(body,{status:206,headers});
};
let source=RangeSource("https://media.test/file",function () {});
assert.equal((await source.Read(5,16777220)).length,16777220);
assert.deepEqual(requests,[[5,16777220],[16777221,16777224]],
  "each network range stays within the edge service's 16 MiB bound");
assert.equal(source.total,total);
mode="changed";
await assert.rejects(source.Read(0,16),/changed/);
for (const [state,error] of [["ignored",/requested range/],["wrong",/requested range/],
  ["truncated",/truncated/],["overflow",/more bytes/]]) {
  mode=state;source=RangeSource("https://media.test/file",function () {});
  await assert.rejects(source.Read(0,16),error);
}
mode="normal";source=RangeSource("https://media.test/file",function () {});
assert.equal((await source.Read(total-8,16)).length,8,"last atom header can end at EOF");
console.log("Media ranges: bounded reads, EOF, ignored ranges, changed files, truncation and excess data passed.");
