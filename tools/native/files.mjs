import {spawnSync} from "node:child_process";
import {mkdirSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {resolve} from "node:path";
const root=fileURLToPath(new URL("../../",import.meta.url)),out=resolve(root,"build/native/files");
mkdirSync(out,{recursive:true});
for(const [cmd,args] of [["qmake6",[resolve(root,"tools/native/tests/files.pro")]], ["make",["-j2"]], ["dbus-run-session",["./files-test"]]]) {
  const run=spawnSync(cmd,args,{cwd:out,stdio:"inherit"});
  if(run.error)throw run.error;if(run.signal)throw Error(cmd+" stopped by "+run.signal);if(run.status)process.exit(run.status);
}
