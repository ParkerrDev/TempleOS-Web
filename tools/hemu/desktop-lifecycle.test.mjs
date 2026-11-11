import assert from "node:assert/strict";
import {readFile,writeFile,mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {chromium} from "playwright-core";
import {DesktopServer} from "./desktop.mjs";
import {BrowserMachine,MachinePost,MachineReady} from "./BrowserMachine.mjs";
import {SnapshotInspect} from "../../engine/Snapshot.js";
import {LegacySnapshot} from "./LegacySnapshot.mjs";

const browser=await chromium.launch({executablePath:process.env.CHROMIUM||"/usr/bin/chromium",headless:true,
  args:["--no-sandbox"]}),temp=await mkdtemp(join(tmpdir(),"hemu-desktop-lifecycle-"));
const Pixels=page=>page.locator("#screen").evaluate(async canvas=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",
  canvas.getContext("2d").getImageData(0,0,canvas.width,canvas.height).data)),v=>v.toString(16).padStart(2,"0")).join(""));
try {
  const legacyPath=join(temp,"historical.hemu");await writeFile(legacyPath,Buffer.from(await LegacySnapshot()));
  for(const variant of [1,4,"legacy"]) {
    const cores=variant===1?1:4,legacy=variant==="legacy",app=await DesktopServer({cores,snapshot:legacy?legacyPath:null}),
      context=await browser.newContext({viewport:{width:1000,height:800}});
    try {
      await BrowserMachine(context);
      const page=await context.newPage(),errors=[];
      page.on("dialog",dialog=>dialog.accept());page.on("pageerror",error=>errors.push(error.message));
      await page.goto(app.url);await MachineReady(page,cores,{legacy});
      if(legacy) {
        await page.locator("#pause").click();
        await page.waitForFunction(()=>window.machine.frames>30);
      } else await page.waitForFunction(()=>window.machine.events.some(m=>m.cmd==="guestPatch"&&["installed","failed"].includes(m.state)),null,{timeout:45000});
      if(!legacy)assert.equal(await page.evaluate(()=>window.machine.events.find(m=>m.cmd==="guestPatch"&&
        ["installed","failed"].includes(m.state)).state),"installed","the desktop serves the native document correction source");
      if(variant===1) {
        const before=await page.evaluate(()=>({frames:window.machine.frames,stops:window.machine.terminations.length}));
        await page.locator("#open").setInputFiles(new URL("./fixtures/legacy-smp.ram.gz",import.meta.url).pathname);
        await page.waitForFunction(()=>document.getElementById("status").textContent.includes("missing or mismatched CPU state"));
        await page.waitForFunction(n=>window.machine.frames>n+5,before.frames);
        assert.equal(await page.evaluate(()=>window.machine.terminations.length),before.stops,"a mismatched RAM import cannot replace the live desktop");
      }
      await page.locator("#pause").click();
      await page.waitForFunction(()=>document.getElementById("pause").textContent==="Resume");
      const pixels=await Pixels(page),fps=await page.locator("#fps").innerText(),
        download=page.waitForEvent("download",{timeout:60000});
      await page.locator("#save").click();
      const path=join(temp,"session-"+variant+".hemu");await (await download).saveAs(path);
      const head=await SnapshotInspect(await readFile(path),{busProtocol:1});
      assert.equal(head.meta.version,cores===4&&!legacy?2:1);
      assert.equal(head.meta.requiredBusProtocol,cores===4&&!legacy?1:undefined);
      let after=await page.evaluate(()=>window.machine.events.length);
      await page.locator("#open").setInputFiles(path);
      await page.waitForFunction(n=>window.machine.events.slice(n).some(m=>m.cmd==="restored"),after,{timeout:45000});
      assert.equal(await Pixels(page),pixels,"full saved RGBA frame survives desktop restore");
      assert.equal(await page.locator("#fps").innerText(),fps);
      assert.equal(await page.locator("#pause").innerText(),"Resume");
      after=await page.evaluate(()=>window.machine.events.length);
      await page.locator("#restart").click();
      await page.waitForFunction(n=>window.machine.events.slice(n).some(m=>m.cmd==="restored"),after,{timeout:45000});
      assert.equal(await Pixels(page),pixels,"restart uses the imported full machine");
      if(cores===4)assert.ok(await page.evaluate(()=>window.machine.terminations.every(t=>t.stopped===1)));
      await page.locator("#pause").click();
      after=await page.evaluate(()=>window.machine.events.length);
      await MachinePost(page,{cmd:"osExec",id:"native-fault",target:"adam",src:`
U0 DesktopFault()
{
  Sleep(100);
  asm {
    DU8 0x0F,0x0B;
  }
}
Spawn(&DesktopFault,,,${cores===4?1:-1});
`});
      await page.waitForFunction(n=>window.machine.events.slice(n).some(m=>m.cmd==="error"&&m.retained),after,{timeout:30000});
      assert.equal(await page.locator("#pause").isDisabled(),true);
      assert.match(await page.locator("#status").innerText(),/CPU [01] stopped.*Restart TempleOS/);
      after=await page.evaluate(()=>window.machine.events.length);
      await page.locator("#restart").click();
      await page.waitForFunction(n=>window.machine.events.slice(n).some(m=>m.cmd==="restored"),after,{timeout:45000});
      assert.equal(await page.locator("#pause").isEnabled(),true);
      assert.equal(await Pixels(page),pixels);
      assert.deepEqual(errors,[]);
      console.log(`Desktop ${variant}: coordinated capability, saved RGBA/FPS, import/restart, native fault and recovery pass; snapshot version ${head.meta.version}.`);
    } finally {await context.close();await app.close();}
  }
} finally {await browser.close();await rm(temp,{recursive:true,force:true});}
