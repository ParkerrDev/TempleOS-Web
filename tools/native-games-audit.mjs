import {readFile,writeFile} from "node:fs/promises";
import {Hash,CompilerInputs,BrowserInputs} from "./games/BrowserEvidence.mjs";
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

let evidence={format:1,runtimeSha256:await CompilerInputs(),programs:{}},
  old=null,failures=0,regressions=[];
try {
  old=JSON.parse(await readFile(FILE));
} catch (e) {
  if (e.code!="ENOENT")
    throw e;
}
let browser=null;
try {browser=JSON.parse(await readFile(new URL("games/browser-checks.json",ROOT)));}
catch (e) {if(e.code!=="ENOENT")throw e;}
const browserInputs=await BrowserInputs(),browserCurrent=browser?.format===1 &&
  Object.entries(browserInputs).every(([key,value])=>browser[key]===value);
if(mode!=="--audit" && !browserCurrent)
  throw new Error("Browser startup evidence is missing or stale. Run node tools/browser/games.mjs --write first.");
for (const game of GAMES) {
  const id=game.packageId || game.file,project=await (await gameProject(game)).native(),
    record={name:game.name,sourceSha256:Hash(JSON.stringify(project)),
      compile:false,browserStartup:false,gameplay:"unverified",templeos:"unverified"};
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
  const checked=browser?.programs[id];
  if(checked && mode!=="--audit" && checked.sourceSha256!==record.sourceSha256)
    throw new Error(game.name+" browser startup evidence has stale source. Run node tools/browser/games.mjs --write.");
  record.browserStartup=record.compile && browserCurrent && checked?.sourceSha256===record.sourceSha256 &&
    checked?.startup===true;
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
