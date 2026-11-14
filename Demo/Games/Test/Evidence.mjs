import {readFile,readdir} from "node:fs/promises";
import {createHash} from "node:crypto";
import {FixtureInputs} from "../../../Kernel/Test/Fixtures.mjs";

export const root=new URL("../../../",import.meta.url);
export const GAME_CHECKS=["Babel","Volley","Snake"];
export const GAME_RUNS=2;
export const Hash=bytes=>createHash("sha256").update(bytes).digest("hex");

export async function RuntimeInputs()
{
  const runtime=createHash("sha256");
  for (const name of (await readdir(new URL("Kernel/",root))).filter(name=>name.endsWith(".js")).sort()) {
    runtime.update(name+"\0");
    runtime.update(await readFile(new URL("Kernel/"+name,root)));
  }
  return {
    fixtures:FixtureInputs(),
    fixtureLoaderSha256:Hash(await readFile(new URL("Kernel/Test/Fixtures.mjs",root))),
    guestHarnessSha256:Hash(await readFile(new URL("Kernel/Test/GuestHarness.mjs",root))),
    webRuntimeSha256:runtime.digest("hex"),
    siblings:(await readFile(new URL("Siblings.txt",root),"utf8")).split("\n").
      filter(line=>/^(hemu|holyc-wasm) /.test(line))
  };
}

export async function GameInputs()
{
  return {
    launchesPerTask:GAME_RUNS,
    harnessSha256:Hash(await readFile(new URL("Demo/Games/Test/Native.HC",root))),
    runnerSha256:Hash(await readFile(new URL("Demo/Games/Test/Native.mjs",root))),
    ...await RuntimeInputs()
  };
}
