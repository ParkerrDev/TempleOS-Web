import assert from "node:assert/strict";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {QemuRun} from "../../holyc-wasm/tests/oracle/Qemu.mjs";
import {GuestHarness} from "../hemu/GuestHarness.mjs";
import {GameInputs,Hash,root,GAME_CHECKS,GAME_RUNS} from "./Evidence.mjs";

const args=process.argv.slice(2),
  names=args.filter(arg=>!arg.startsWith("--")),
  count=GAME_RUNS,
  source_dir=process.env.GAME_SOURCE_DIR?pathToFileURL(resolve(process.env.GAME_SOURCE_DIR)+"/"):
    new URL("games/",root);
assert(args.every(arg=>!arg.startsWith("--") ||
  ["--write","--native-only"].includes(arg)),"Unknown native game check option.");
assert(!(process.env.GAME_SOURCE_DIR && args.includes("--write")),
  "Candidate sources cannot replace production evidence.");
if (!names.length) names.push(...GAME_CHECKS);
if (args.includes("--write"))
  assert.deepEqual(names,GAME_CHECKS,"Refresh all qualified scenarios together.");
const source=await readFile(new URL("tools/games/Native.HC",root),"latin1"),files=[],runs=[];
for (const name of names) {
  assert(["Babel","Volley","Snake","Tetris"].includes(name));
  const file=name.toUpperCase()+".HC";
  files.push({name:file,bytes:await readFile(new URL(name+".HC",source_dir))});
  runs.push(source+'\nGameChk("C:/ORACLE/'+file+'","'+name+'",'+count+');\n');
}
if (names.includes("Tetris"))
  files.push({name:"HELP.DD",bytes:await readFile(new URL("Help.DD",source_dir))});
const result=await QemuRun(runs,{files,timeout:60});
await mkdir(new URL("tmp/games/",root),{recursive:true});
await writeFile(new URL("tmp/games/native-"+names.join("-")+".json",root),JSON.stringify(result,null,2)+"\n");
console.log(JSON.stringify(result));
for (const [i,name] of names.entries()) {
  assert.equal(result.results[i].except,"",name);
  assert.equal([...result.results[i].out.matchAll(
    new RegExp("EXIT:"+name+":settings,draw,window,tasks","g"))].length,count,name);
}
if (!args.includes("--native-only")) {
  const h=await GuestHarness({disk:true}),evidence={format:1,...await GameInputs(),
    engineSha256:Hash(h.compiled.bytes),
    backend:result.backend,oracle:result.evidence.split("/").at(-1),programs:{}};
  await h.Exec(source);
  for (const file of files) {
    const id=h.gx.writeFile({path:"C:/ORACLE/"+file.name,bytes:file.bytes});
    for (let frame=0;frame<1000;frame++) {
      await h.Run();
      if (["done","failed","error"].includes(h.gx.status(id)?.state)) break;
    }
    assert.equal(h.gx.status(id)?.state,"done",JSON.stringify(h.gx.status(id)));
  }
  for (const [i,name] of names.entries()) {
    const file=files[i],path="C:/ORACLE/"+file.name;
    const ptr=h.gx.scratch.base+0x1400;
    await h.Exec('GameChk("'+path+'","'+name+'",'+count+');*(0x'+ptr.toString(16)+')(I64*)=game_chk_frame;');
    const frame=new DataView(h.ex.memory.buffer).getBigUint64(h.base+ptr,true).
        toString(16).toUpperCase().padStart(16,"0"),
      native=result.results[i].out.match(new RegExp("FRAME:"+name+":([0-9A-F]+)"))[1];
    assert.equal(frame,native,name+" paused indexed-pixel framebuffer matches native TempleOS");
    evidence.programs[name]={sourceSha256:Hash(file.bytes),frameFnv64:frame,
      native:result.results[i].out.trim().split("\n"),hemu:"same input, frame and exit checks passed"};
    console.log(name+": original V5.03 and HEMU pass input, frame "+frame+" and cleanup.");
  }
  await writeFile(new URL(args.includes("--write")?"tools/games/evidence.json":"tmp/games/evidence.json",root),
    JSON.stringify(evidence,null,2)+"\n");
}
