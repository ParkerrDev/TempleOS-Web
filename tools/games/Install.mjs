import {readFile} from "node:fs/promises";
import {gameProject} from "../../game-source.js";
import {installGame} from "../../game-packages.js";
import {Hash,root} from "./Evidence.mjs";

//The page's fetch and storage, for the site's modules run outside it.
globalThis.localStorage={getItem(){return null;}};
globalThis.fetch=async url=>new Response(await readFile(new URL(url,root)));

let installs=0;

//runInTempleOS in games.js, without the page: what a Games entry writes to the
//guest disk and what it then launches. Both machines get exactly this.
export async function GameInstall(game,write)
{
  if (game.packageId) {
    const generation=++installs; //A fresh guest each time, so nothing is cached.
    return installGame(game.packageId,async function (path,buffer) {
      await write(path,new Uint8Array(buffer));
      return {ok:true};
    },undefined,undefined,()=>generation);
  }
  const project=await gameProject(game),doc=await project.open(project.entry);
  if (game.install) {
    await write(game.install,new Uint8Array(doc.encode(doc.text)));
    return {path:game.install,name:game.name};
  }
  return {name:game.name,src:"#define TOS_NATIVE 1\n"+doc.text};
}

//Seconds of guest time, the same in both machines.
export const START_WAIT=15,START_QUIT=5,FRAME_SECONDS=0.016;
export const ESC=[0x01,0x81],SHIFT_ESC=[0x2A,0x01,0x81,0xAA];

export async function GameFiles(game)
{//What the entry writes and launches, and one hash over all of it.
  const files=[],launch=await GameInstall(game,async function (path,bytes) {
    files.push({path,bytes});
  });
  return {files,launch,sha256:Hash(JSON.stringify({launch,
    files:files.map(f=>({path:f.path,sha256:Hash(f.bytes)}))}))};
}

export async function StartInputs()
{//The files that decide what the startup check does, beside the site runtime.
  const res={};
  for (const name of ["tools/games/Start.HC","tools/games/start.mjs",
    "tools/games/catalog.mjs","tools/games/Install.mjs","game-packages.js","game-source.js"])
    res[name]=Hash(await readFile(new URL(name,root)));
  return res;
}
