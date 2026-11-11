import {readFile,readdir} from "node:fs/promises";
import {createHash} from "node:crypto";

export const root=new URL("../../",import.meta.url);
export const GAME_CHECKS=["Babel","Volley"];
export const Hash=bytes=>createHash("sha256").update(bytes).digest("hex");

export async function GameInputs()
{
  const runtime=createHash("sha256");
  for (const name of (await readdir(new URL("engine/",root))).filter(name=>name.endsWith(".js")).sort()) {
    runtime.update(name+"\0");
    runtime.update(await readFile(new URL("engine/"+name,root)));
  }
  return {
    harnessSha256:Hash(await readFile(new URL("tools/games/Native.HC",root))),
    webRuntimeSha256:runtime.digest("hex"),
    siblings:(await readFile(new URL("Siblings.txt",root),"utf8")).split("\n").
      filter(line=>/^(hemu|holyc-wasm) /.test(line))
  };
}
