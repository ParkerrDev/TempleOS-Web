import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {resolve} from "node:path";
const root=fileURLToPath(new URL("../../",import.meta.url)),
  fixture=process.env.HEMU_NATIVE_FIXTURE||resolve(root,"build/native/TempleOS.hemu"),
  tests=["tools/native/build.mjs",...process.env.HEMU_NATIVE_FIXTURE?[]:["tools/native/fixture.mjs"],
    ...process.platform==="linux"?["tools/native/version.mjs"]:[],"tools/native/streams.mjs","tools/native/test.mjs","tools/native/lifecycle.mjs","tools/native/format.mjs",
    ...process.platform==="linux"?["tools/native/pointer/build.mjs","tools/native/pointer/protocol.mjs","tools/native/pointer/backend.mjs"]:[],
    ...process.argv.includes("--web")?["tools/native/consumer.mjs"]:[]];
for(const test of tests) {
  const run=spawnSync(process.execPath,[test],{cwd:root,stdio:"inherit",env:{...process.env,HEMU_NATIVE_FIXTURE:fixture}});
  if(run.error)throw run.error;if(run.signal)throw Error(test+" stopped by "+run.signal);if(run.status)process.exit(run.status);
}
