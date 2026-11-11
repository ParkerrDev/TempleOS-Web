import {spawnSync} from "node:child_process";
import {mkdirSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {resolve} from "node:path";
const root=fileURLToPath(new URL("../../",import.meta.url)),out=resolve(root,"build/native/lifecycle");
mkdirSync(out,{recursive:true});
for(const [cmd,args] of [["qmake6",[resolve(root,"tools/native/tests/lifecycle.pro"),"RESOURCES+="+resolve(root,"build/native/Runtime.qrc")]],
  ["make",["-j2"]],process.argv.includes("--gc-proof")?
    ["gdb",["-q","-batch","-x",resolve(root,"tools/native/tests/DeferredGc.gdb"),"./native-lifecycle"]]:["./native-lifecycle",[]]]) {
  const run=spawnSync(cmd,args,{cwd:out,stdio:"inherit",timeout:90000,
    env:{...process.env,QT_QPA_PLATFORM:"offscreen",QT_QUICK_BACKEND:"software",QT_FORCE_STDERR_LOGGING:"1"}});
  if(run.error)throw run.error;if(run.signal)throw Error(cmd+" stopped by "+run.signal);if(run.status)process.exit(run.status);
}
