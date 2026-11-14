import {readFileSync,writeFileSync} from "node:fs";

//Ask for the page module graph while parsing HTML.
const root=new URL("../",import.meta.url),page=new URL("index.html",root),
  html=readFileSync(page,"utf8"),
  START="  <!-- modules the page's scripts import: Misc/Preload.mjs -->\n",
  IMPORT=/^\s*(?:import|export)\s+(?:[^'"]*?\sfrom\s*)?["'](\.[^"']+)["']/gm;

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

const entries=[...html.matchAll(/<script type="module" src="([^"]+)"><\/script>/g)].map(m=>m[1]),
  want=Graph(entries);
if (!entries.length) throw Error("No page modules");
{
  const block=START+want.map(path=>`  <link rel="modulepreload" href="${path}" />\n`).join("");
  let at=html.indexOf(START),stop=at+START.length;
  if(at<0)at=stop=html.indexOf("  <style>");
  if (at<0) throw Error("No preload insertion point");
  while(html.startsWith('  <link rel="modulepreload"',stop))stop=html.indexOf("\n",stop)+1;
  writeFileSync(page,html.slice(0,at)+block+html.slice(stop));
}
console.log("Preloaded "+want.length+" page modules.");
