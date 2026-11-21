import assert from "node:assert/strict";
import {execFile} from "node:child_process";
import {mkdir,readFile,rm,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {promisify} from "node:util";
import {ENTRIES} from "../../../Apps/Programs.js";
import {fat32Read} from "../../../hemu/holyc-wasm/Apps/HEMU/Kernel/QCow2.js";
import {createGuestInput} from "../../../hemu/holyc-wasm/Apps/HEMU/Kernel/GuestInput.js";
import {GuestHarness} from "../../../hemu/holyc-wasm/Apps/HEMU/Kernel/Test/GuestHarness.mjs";
import {Hash,RuntimeInputs,root} from "./Evidence.mjs";
import {ESC,FRAME_SECONDS,GameInstall,SHIFT_ESC,START_QUIT,START_WAIT} from "./Install.mjs";
import {KeyBytes,MS_START,PlayEnd,PlayEvents,SnapSave} from "./Play.mjs";

//node Demo/Games/Test/Catalog.mjs NAME [control|play] runs one entry: control is
//the startup check over the times of its play script, play plays the script.
//FRAMES names a directory for the snaps' PNGs. --all runs every entry's
//startup check alone, with Esc at START_WAIT.
const arg=process.argv[2] || "Talons",kind=process.argv[3],out=resolve(process.env.OUT ||
    fileURLToPath(new URL("tmp/games/catalog/",root))),
  observe=Number(process.env.CATALOG_FRAMES || Math.ceil(START_WAIT/FRAME_SECONDS)),
  quit=Math.ceil(START_QUIT/FRAME_SECONDS),
  BUDGET=12000000, //GuestHarness's instructions a frame.
  filename=game=>(game.packageId || game.file)+".json";
assert(Number.isInteger(observe) && observe>=1 && observe<=10000,
  "CATALOG_FRAMES must be an integer from 1 to 10000.");
await mkdir(out,{recursive:true});
if (arg=="--all") {
  const results=[],run=promisify(execFile);
  for (const game of ENTRIES) {
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
  const game=ENTRIES.find(g=>g.name==arg);
  assert(game,"Unknown entry: "+arg);
  globalThis.localStorage={getItem(){return null;}};
  globalThis.fetch=async url=>new Response(await readFile(new URL(url,root)));
  assert(!kind || kind=="control" || kind=="play","Use control or play.");
  const events=kind && PlayEvents(game.name,kind),input=createGuestInput({guest:()=>h?.gx}),
    frames=process.env.FRAMES || resolve(out,filename(game).slice(0,-5));
  const report={name:game.name,backend:"HEMU",kind:kind || "start",...await RuntimeInputs(),
    runnerSha256:Hash(await readFile(new URL(import.meta.url))),
    install:"not-started",launch:"not-started",run:null,quit:null,end:null,
    gameplay:"unverified",input:"unverified",observationBudgetFrames:observe,
    observedFrames:0,files:[],timingsMs:{}},start=performance.now();
  let h,id,slices=1;
  input.accept({x:MS_START[0],y:MS_START[1],b:0});
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
  //A game whose frame takes the window manager longer than a frame of
  //instructions is mid-refresh at every frame's end, and the gap between two
  //refreshes can be shorter than any slice. So the snap is the frame the
  //engine kept as GrUpdateScrn's GrUpdateVGAGraphics returned (Cpu.HC
  //CaptureDesk, g_desk): gr.dc2's colors once a refresh is done, as Start.HC's
  //PlaySnap copies them. The guest runs in slices of a frame, with their share
  //of its time, so the snap is the first refresh done after its request.
  const SNAP_FRAMES=1000,SLICES=32;
  async function Snap(k)
  {//The frame the window manager last finished, at the first refresh done after now.
    const dv=()=>new DataView(h.ex.memory.buffer),at=name=>h.compiled.globals.get(name).addr,
      seq=()=>dv().getBigInt64(at("g_desk_seq"),true),first=seq();
    slices=SLICES;
    h.TimeSet(FRAME_SECONDS*1e9/SLICES);
    try {
      for (let n=0;n<SNAP_FRAMES*SLICES;n++) {
        await h.Run();
        report.observedFrames+=1/SLICES;
        if (seq()!=first) {
          const desk=Number(dv().getBigUint64(at("g_desk"),true));
          return {updates:h.gx.frameStats().updates,...await SnapSave(frames,"site-"+kind+"-"+k,
            new Uint8Array(h.ex.memory.buffer,desk,640*480).slice())};
        }
      }
    } finally {
      slices=1;
      h.TimeSet(FRAME_SECONDS*1e9);
    }
    throw new Error("The window manager finished no refresh in "+SNAP_FRAMES+" frames.");
  }
  async function Play()
  {//PlayEvents as Start.HC's PlayRun plays them, a frame standing for FRAME_SECONDS.
    const at=t=>Math.round(t/1000/FRAME_SECONDS),running=()=>h.gx.status(id).state=="running",
      t0=report.observedFrames,now=()=>report.observedFrames-t0;
    let i,base=0;
    report.snaps=[];
    for (i=0;i<events.length;i++) {
      const ev=events[i];
      while (now()<base+at(ev.t) && running()) {
        await h.Run();
        report.observedFrames++;
      }
      if (!running())
        break;
      if (ev.op=="snap") {
        report.snaps.push(await Snap(report.snaps.length));
        base=now()-at(ev.t);
      } else if (ev.op=="key")
        h.Key(KeyBytes(ev.key,ev.down));
      else if (ev.op=="ms")
        input.accept({x:ev.x,y:ev.y,b:ev.l|ev.r<<1});
      else if (await Running(quit))
        base=now()-at(ev.t); //What follows a quit counts from its end.
      else
        break;
    }
    report.quit=PlayEnd(events,i);
    report.end=i<events.length?End(h.gx.status(id)):"-";
  }
  function Thrown(error)
  {//A HolyC throw in the engine is a WebAssembly.Exception: its I64 code, as text.
    const tag=h?.ex.__exception_tag;
    if (!(error instanceof WebAssembly.Exception) || !tag || !error.is(tag))
      return String(error);
    let code=BigInt.asUintN(64,error.getArg(tag,0)),res="";
    for (;code;code>>=8n)
      res+=String.fromCharCode(Number(code&0xFFn));
    return "'"+res+"' ("+error.getArg(tag,0)+")";
  }
  function End(state)
  {//Start.HC's words for how the launch ended.
    if (state.state=="failed")
      return state.except===undefined?"never":"except:"+state.except;
    return state.msg.endsWith(" exited")?"returned":"closed";
  }
  try {
    h=await GuestHarness({disk:true,input,
      budgetProbe:()=>BigInt(BUDGET/slices)});
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
    } else if (events) {
      report.run="running";
      await Play();
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
    report.failure=error?.stack || "The engine threw "+Thrown(error);
    process.exitCode=1;
  }
  report.timingsMs.total=performance.now()-start;
  await writeFile(resolve(out,filename(game)),JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify({name:game.name,install:report.install,run:report.run,quit:report.quit,
    end:report.end,seconds:report.timingsMs.total/1000,failure:report.failure}));
}
