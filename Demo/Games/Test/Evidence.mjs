import {readFile,readdir} from "node:fs/promises";
import {createHash} from "node:crypto";
import {FixtureInputs} from "../../../hemu/holyc-wasm/Apps/HEMU/Kernel/Test/Fixtures.mjs";
import {HemuPath} from "../../../hemu/holyc-wasm/Apps/HEMU/Kernel/Paths.js";

export const root=new URL("../../../",import.meta.url);
export const GAME_CHECKS=["Babel","Volley","Snake"];
export const GAME_RUNS=2;
export const Hash=bytes=>createHash("sha256").update(bytes).digest("hex");

export async function RuntimeInputs()
{
  const runtime=createHash("sha256"),compiler=createHash("sha256");
  for (const name of (await readdir(new URL("hemu/holyc-wasm/Apps/HEMU/Kernel/",root))).filter(name=>name.endsWith(".js") || name.endsWith(".wasm")).sort()) {
    runtime.update(name+"\0");
    runtime.update(await readFile(new URL("hemu/holyc-wasm/Apps/HEMU/Kernel/"+name,root)));
  }
  for (const name of (await readdir(new URL("hemu/holyc-wasm/src/runtime/",root))).filter(name=>name.endsWith(".js")).sort()) {
    compiler.update(name+"\0");
    compiler.update(await readFile(new URL("hemu/holyc-wasm/src/runtime/"+name,root)));
  }
  compiler.update(await readFile(new URL("hemu/holyc-wasm/src/abi.js",root)));
  return {
    fixtures:FixtureInputs(),
    fixtureLoaderSha256:Hash(await readFile(new URL("hemu/holyc-wasm/Apps/HEMU/Kernel/Test/Fixtures.mjs",root))),
    guestHarnessSha256:Hash(await readFile(new URL("hemu/holyc-wasm/Apps/HEMU/Kernel/Test/GuestHarness.mjs",root))),
    machineRuntimeSha256:runtime.digest("hex"),
    compilerRuntimeSha256:compiler.digest("hex"),
    diskModuleSha256:Hash(await readFile(HemuPath("build/disk.wasm"))) //The one QCow2.js loads.
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
