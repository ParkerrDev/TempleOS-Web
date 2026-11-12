import assert from "node:assert/strict";
import {readFileSync,writeFileSync} from "node:fs";

//index.html names every module its scripts import, so the browser asks for
//them all while it parses the page, not one level of imports a round trip
//later. node tools/preload.test.mjs --write writes the list. Workers list
//theirs as imports of their own.
const root=new URL("../",import.meta.url),page=new URL("index.html",root),
  html=readFileSync(page,"utf8"),
  START="  <!-- modules the page's scripts import: tools/preload.test.mjs -->\n",
  IMPORT=/^\s*(?:import|export)\s+(?:[^'"]*?\sfrom\s*)?["'](\.[^"']+)["']/gm,
  WORKERS=["engine/hemu-worker.js","engine/hemu-smp-worker.js","engine/StockDiskWorker.js",
    "engine/StockInflateWorker.js"];

function Graph(entries)
{//Each static import, by depth then name. Dynamic import() waits for its caller.
  const depth=new Map(),todo=entries.map(path=>[path,0]);
  for(let i=0;i<todo.length && i<10000;i++) {
    const [path,d]=todo[i];
    if(depth.has(path) && depth.get(path)<=d)continue;
    depth.set(path,d);
    for(const m of readFileSync(new URL(path,root),"utf8").matchAll(IMPORT))
      todo.push([new URL(m[1],new URL(path,root)).href.slice(root.href.length),d+1]);
  }
  return [...depth].filter(([path])=>!entries.includes(path))
    .sort((a,b)=>a[1]-b[1] || (a[0]<b[0]?-1:1)).map(([path])=>path);
}

function Depth(entry)
{//Each module the worker entry loads, at its import depth.
  const depth=new Map([[entry,0]]),todo=[entry];
  for(let i=0;i<todo.length && i<10000;i++)
    for(const m of readFileSync(new URL(todo[i],root),"utf8").matchAll(IMPORT)) {
      const path=new URL(m[1],new URL(todo[i],root)).href.slice(root.href.length);
      if(depth.has(path))continue;
      depth.set(path,depth.get(todo[i])+1);
      todo.push(path);
    }
  return depth;
}

//A worker has no modulepreload, so each worker imports its whole graph itself.
for(const worker of WORKERS) {
  const deep=[...Depth(worker)].filter(([,d])=>d>1).map(([path])=>path);
  assert.deepEqual(deep,[],worker+" must import these itself: "+deep.join(", "));
}

const entries=[...html.matchAll(/<script type="module" src="([^"]+)"><\/script>/g)].map(m=>m[1]),
  want=Graph(entries),
  have=[...html.matchAll(/<link rel="modulepreload" href="([^"]+)" \/>/g)].map(m=>m[1]);
assert.ok(entries.length>0,"index.html loads its scripts as modules");
if(process.argv.includes("--write")) {
  const block=START+want.map(path=>`  <link rel="modulepreload" href="${path}" />\n`).join("");
  let at=html.indexOf(START),stop=at+START.length;
  if(at<0)at=stop=html.indexOf("  <style>");
  assert.ok(at>0,"index.html has a head style to put the links before");
  while(html.startsWith('  <link rel="modulepreload"',stop))stop=html.indexOf("\n",stop)+1;
  writeFileSync(page,html.slice(0,at)+block+html.slice(stop));
} else assert.deepEqual(have,want,"index.html's modulepreload links are stale: node tools/preload.test.mjs --write");
console.log(`index.html preloads the ${want.length} modules its ${entries.length} scripts import; `+
  `the ${WORKERS.length} workers import their whole graphs.`);
