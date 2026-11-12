import assert from "node:assert/strict";
import {execFile} from "node:child_process";
import {mkdir,readFile,rm,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {promisify} from "node:util";
import {GAMES} from "../../GameCatalog.js";
import {fat32Read} from "../../engine/qcow2.js";
import {GuestHarness} from "../hemu/GuestHarness.mjs";
import {Hash,RuntimeInputs,root} from "./Evidence.mjs";
import {ESC,FRAME_SECONDS,GameInstall,SHIFT_ESC,START_QUIT,START_WAIT} from "./Install.mjs";

const arg=process.argv[2] || "Talons",out=resolve(process.env.OUT ||
    fileURLToPath(new URL("tmp/games/catalog/",root))),
  observe=Number(process.env.CATALOG_FRAMES || Math.ceil(START_WAIT/FRAME_SECONDS)),
  quit=Math.ceil(START_QUIT/FRAME_SECONDS),
  filename=game=>(game.packageId || game.file)+".json";
assert(Number.isInteger(observe) && observe>=1 && observe<=10000,
  "CATALOG_FRAMES must be an integer from 1 to 10000.");
await mkdir(out,{recursive:true});
if (arg=="--all") {
  const results=[],run=promisify(execFile);
  for (const game of GAMES) {
    await rm(resolve(out,filename(game)),{force:true});
    try {
      await run(process.execPath,["--max-old-space-size=3072",fileURLToPath(import.meta.url),game.name],
        {timeout:180000,maxBuffer:65536,env:{...process.env,OUT:out}});
    } catch (error) {
      if (error.killed || error.signal) {
        const report={name:game.name,launch:error.killed?"timeout":"harness-error",
          gameplay:"unverified",failure:error.killed?
            "Catalog child exceeded its 180-second wall-time limit.":
            "Catalog child terminated with signal "+error.signal};
        await writeFile(resolve(out,filename(game)),JSON.stringify(report,null,2)+"\n");
      } else if (!Number.isInteger(error.code)) {
        throw error;
      }
    }
    const report=JSON.parse(await readFile(resolve(out,filename(game)),"utf8"));
    results.push(report);
    console.log(game.name+": "+[report.run,report.quit,report.end].join(" ")+"; gameplay unverified"+
      (report.failure?"; "+report.failure.split("\n")[0]:""));
  }
  await writeFile(resolve(out,"summary.json"),JSON.stringify(results,null,2)+"\n");
  process.exitCode=results.some(r=>!["running","returned"].includes(r.launch))?1:0;
} else {
  const game=GAMES.find(g=>g.name==arg);
  assert(game,"Unknown catalog game: "+arg);
  globalThis.localStorage={getItem(){return null;}};
  globalThis.fetch=async url=>new Response(await readFile(new URL(url,root)));
  const report={name:game.name,backend:"HEMU",...await RuntimeInputs(),
    runnerSha256:Hash(await readFile(new URL(import.meta.url))),
    install:"not-started",launch:"not-started",run:null,quit:null,end:null,
    gameplay:"unverified",input:"unverified",observationBudgetFrames:observe,
    observedFrames:0,files:[],timingsMs:{}},start=performance.now();
  let h,id;
  async function Wait(request,states)
  {
    for (let frame=0;frame<2000;frame++) {
      const state=h.gx.status(request);
      if (states.includes(state?.state)) return state;
      await h.Run();
    }
    throw new Error("Guest request did not settle: "+JSON.stringify(h.gx.status(request)));
  }
  async function Running(frames)
  {//TRUE while the game still runs after frames, as Start.HC's StartWait.
    for (let frame=0;frame<frames && h.gx.status(id).state=="running";frame++) {
      await h.Run();
      report.observedFrames++;
    }
    return h.gx.status(id).state=="running";
  }
  function End(state)
  {//Start.HC's words for how the launch ended.
    if (state.state=="failed")
      return state.except===undefined?"never":"except:"+state.except;
    return state.msg.endsWith(" exited")?"returned":"closed";
  }
  try {
    h=await GuestHarness({disk:true});
    report.timingsMs.boot=performance.now()-start;
    report.engineSha256=Hash(h.compiled.bytes);
    const before=performance.now();
    const launch=await GameInstall(game,async function (path,bytes) {
      const state=await Wait(h.gx.writeFile({path,bytes}),["done","failed","error"]);
      assert.equal(state.state,"done",JSON.stringify(state));
      const relative=path.slice(3),cut=relative.lastIndexOf("/"),
        saved=fat32Read(h.disk,relative.slice(0,cut),relative.slice(cut+1));
      assert.deepEqual(Buffer.from(saved || []),Buffer.from(bytes),"Guest file differs: "+path);
      report.files.push({path,size:bytes.length,sha256:Hash(bytes)});
    });
    if (launch.src!==undefined)
      report.files.push({path:game.file,sha256:Hash(Buffer.from(launch.src,"latin1"))});
    report.install="passed";
    report.timingsMs.install=performance.now()-before;
    id=h.gx.launch(launch);
    const initial=await Wait(id,["running","done","failed","error"]);
    assert.notEqual(initial.state,"error",JSON.stringify(initial));
    const observing=performance.now();
    if (!await Running(observe)) {
      report.run=End(h.gx.status(id));
      report.quit=report.end="-";
    } else {
      report.run="running";
      h.Key(ESC);
      if (!await Running(quit))
        report.quit="esc";
      else {
        h.Key(SHIFT_ESC);
        report.quit=await Running(quit)?"ignored":"shift-esc";
      }
      report.end=report.quit=="ignored"?"-":End(h.gx.status(id));
    }
    report.timingsMs.observe=performance.now()-observing;
    report.state=h.gx.status(id);
    report.launch=report.run=="running" || report.run=="returned"?report.run:"failed";
  } catch (error) {
    report.launch="failed";
    report.state=h?.gx.status(id);
    report.failure=error.stack;
    process.exitCode=1;
  }
  report.timingsMs.total=performance.now()-start;
  await writeFile(resolve(out,filename(game)),JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify({name:game.name,install:report.install,run:report.run,quit:report.quit,
    end:report.end,seconds:report.timingsMs.total/1000,failure:report.failure}));
}
