import {readFile,writeFile,readdir} from "node:fs/promises";
import {createHash} from "node:crypto";
import {gameProject} from "../game-source.js";
import {compileNativeProject} from "../editor/project.js";
import {GAMES} from "../GameCatalog.js";

const ROOT=new URL("../",import.meta.url),FILE=new URL(
  "games/compatibility.json",ROOT),mode=process.argv[2] || "--audit";
if (!["--audit","--check","--write"].includes(mode))
  throw new Error("Use --audit, --check or --write.");
globalThis.fetch=async function (url) {
  return new Response(await readFile(new URL(url,ROOT)));
};
globalThis.localStorage={getItem:function () {return null;}};

async function Files(dir)
{
  let res=[],entry;
  for (entry of await readdir(new URL(dir,ROOT),{withFileTypes:true})) {
    if (entry.isDirectory())
      res.push(...await Files(dir+entry.name+"/"));
    else if (entry.name.endsWith(".js"))
      res.push(dir+entry.name);
  }
  return res.sort();
}
function Hash(value)
{
  return createHash("sha256").update(value).digest("hex");
}
const runtime=createHash("sha256");
for (const path of [...await Files("holyc-wasm/src/"),"editor/project.js"]) {
  runtime.update(path+"\0");
  runtime.update(await readFile(new URL(path,ROOT)));
}
let evidence={format:1,runtimeSha256:runtime.digest("hex"),programs:{}},
  old=null,failures=0,regressions=[];
try {
  old=JSON.parse(await readFile(FILE));
} catch (e) {
  if (e.code!="ENOENT")
    throw e;
}
for (const game of GAMES) {
  const id=game.packageId || game.file,project=await (await gameProject(game)).native(),
    record={name:game.name,sourceSha256:Hash(JSON.stringify(project)),
      compile:false,gameplay:"unverified",templeos:"unverified"};
  try {
    const result=compileNativeProject(project);
    if (!WebAssembly.validate(result.bytes))
      throw new Error("Generated module failed WebAssembly validation.");
    record.compile=true;
    record.wasmSha256=Hash(result.bytes);
    if (result.warnings.length)
      record.warnings=result.warnings;
  } catch (e) {
    record.error=e.message;
    failures++;
    if (old?.programs[id]?.compile)
      regressions.push(game.name+": "+e.message);
  }
  evidence.programs[id]=record;
  if (mode=="--audit")
    console.log(game.name+": "+(record.compile ? "compiled" : record.error.split("\n")[0]));
}
if (regressions.length)
  throw new Error("Previously compiling programs regressed:\n"+regressions.join("\n"));
if (mode=="--write")
  await writeFile(FILE,JSON.stringify(evidence,null,2)+"\n");
else if (mode=="--check") {
  if (JSON.stringify(old)!=JSON.stringify(evidence))
    throw new Error("Program evidence is missing or stale. Run the audit and "+
      "review the results before regenerating games/compatibility.json.");
} else if (failures)
  process.exitCode=1;
console.log(GAMES.length-failures+"/"+GAMES.length+
  " programs compile to WebAssembly. Gameplay/TempleOS parity remain unverified.");
