import {readFile,readdir} from "node:fs/promises";
import {createHash} from "node:crypto";
import {FixtureInputs} from "../hemu/Fixtures.mjs";

export const root=new URL("../../",import.meta.url);
export const GAME_CHECKS=["Babel","Volley"];
export const GAME_RUNS=2;
export const Hash=bytes=>createHash("sha256").update(bytes).digest("hex");

export async function RuntimeInputs()
{
  const runtime=createHash("sha256");
  for (const name of (await readdir(new URL("engine/",root))).filter(name=>name.endsWith(".js")).sort()) {
    runtime.update(name+"\0");
    runtime.update(await readFile(new URL("engine/"+name,root)));
  }
  return {
    fixtures:FixtureInputs(),
    fixtureLoaderSha256:Hash(await readFile(new URL("tools/hemu/Fixtures.mjs",root))),
    guestHarnessSha256:Hash(await readFile(new URL("tools/hemu/GuestHarness.mjs",root))),
    webRuntimeSha256:runtime.digest("hex"),
    siblings:(await readFile(new URL("Siblings.txt",root),"utf8")).split("\n").
      filter(line=>/^(hemu|holyc-wasm) /.test(line))
  };
}

export async function GameInputs()
{
  return {
    launchesPerTask:GAME_RUNS,
    harnessSha256:Hash(await readFile(new URL("tools/games/Native.HC",root))),
    runnerSha256:Hash(await readFile(new URL("tools/games/native.mjs",root))),
    ...await RuntimeInputs()
  };
}
