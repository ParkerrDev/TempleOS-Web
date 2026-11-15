import assert from "node:assert/strict";
import {createServer} from "node:http";
import {once} from "node:events";
import {readFile,mkdir} from "node:fs/promises";
import {chromium} from "playwright-core";
import {ServeReq} from "../Misc/Server.mjs";

const server=createServer(ServeReq).listen(0,"127.0.0.1");
await once(server,"listening");
const browser=await chromium.launch({executablePath:process.env.CHROMIUM || "/usr/bin/chromium",
  headless:true,args:["--no-sandbox"]});
try {
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),
    page=await context.newPage(),errors=[];
  page.on("pageerror",function (error) {errors.push(error.message);});
  await context.routeWebSocket(/templeosweb-.*\.workers\.dev/,function (socket) {socket.close();});
  await context.route("**/hemu/*.gz",async function (route) {
    const name=new URL(route.request().url()).pathname.split("/").pop();
    await route.fulfill({body:await readFile(new URL("../hemu/"+name,import.meta.url)),
      contentType:"application/gzip"});
  });
  await context.addInitScript(function () {
    window.labelWindows=[];
    const Base=SharedWorker;
    window.SharedWorker=class extends Base {
      constructor(...args) {
        super(...args);
        if (!String(args[0]).includes("MachineHub.js")) return;
        this.port.addEventListener("message",function (e) {
          if (e.data.cmd=="windows") window.labelWindows=e.data.windows;
          if (e.data.cmd=="frame") window.labelPixels=e.data.buf;
        });
      }
    };
  });
  await page.goto("http://127.0.0.1:"+server.address().port+"/?single");
  await page.evaluate(async function () {window.labelOs=await import("/Adam/Os.js");});
  await page.waitForFunction(function () {
    return labelOs.OsReady() && labelOs.engine.capture.ready;
  },null,{timeout:120000});
  const entries=await page.evaluate(async function () {
    const result=await labelOs.OsDirList("C:/");
    if (!result.ok) throw Error(result.msg);
    return result.files.filter(function (file) {return file.name!="." && file.name!="..";}).map(function (file) {return file.name;});
  });
  await page.locator("#settingsBtn").click();
  await page.locator("#nativeDrawing").check();
  await page.locator("#windowScale").selectOption("2");
  await page.locator("#windowPassthrough").check();
  await page.locator("#settingsClose").click();
  await page.waitForFunction(function () {return labelWindows.length;},null,{timeout:60000});
  await page.locator("#filesBtn").click();
  await page.locator('#filesList button[data-name="Home"]').waitFor();
  await page.evaluate(async function () {
    const {GuiScene}=await import("/Adam/GuiBridge.js"),
      {FONT}=await import("/hemu/holyc-wasm/src/runtime/font.js");
    window.LabelCheck=function (native=false) {
      const win=document.getElementById("filesWin"),scene=GuiScene(win),
        view=new DataView(scene.gui.buffer),text=[],list=document.getElementById("filesList").getBoundingClientRect(),rect=win.getBoundingClientRect(),
        task=labelWindows.find(function (w) {return w.host=="filesWin";}),pixels=new Uint8Array(labelPixels || 0),
        labels=[...win.querySelectorAll(".files-name span")].filter(function (el) {
          const r=el.getBoundingClientRect();
          return r.top>=list.top && r.bottom<=list.bottom;
        }),missing=[],badPixels=[];
      for (let at=24;at<scene.gui.length;at+=32+view.getInt32(at+28,true))
        if (view.getInt32(at,true)==2) {
          const bytes=scene.gui.subarray(at+32,at+32+view.getInt32(at+28,true));
          text.push({x:view.getInt32(at+4,true),y:view.getInt32(at+8,true),
            color:view.getInt32(at+20,true),value:new TextDecoder().decode(bytes.subarray(0,bytes.indexOf(0)))});
        }
      for (const label of labels) {
        const name=label.textContent,r=label.getBoundingClientRect(),
          x=Math.round((r.left-rect.left-win.clientLeft)*scene.scale),
          y=Math.round((r.top-rect.top-win.clientTop)*scene.scale),
          command=text.find(function (cmd) {return cmd.value==name && Math.abs(cmd.x-x)<=1 && Math.abs(cmd.y-y)<=1;});
        if (!command) {missing.push(name);continue;}
        if (!native) continue;
        if (!task) {badPixels.push(name+": no native task");continue;}
        let matches=true;
        for (let i=0;i<name.length;i++)
          for (let y=0;y<8;y++)
            for (let x=0;x<8;x++) {
              const pixel=pixels[(task.y+8+command.y+y)*640+task.x+8+command.x+i*8+x],
                ink=!!(FONT[name.charCodeAt(i)*8+y] & 1<<x);
              if ((pixel==command.color)!=ink) matches=false;
            }
        if (!matches) badPixels.push(name);
      }
      return {names:labels.map(function (el) {return el.textContent;}),missing,badPixels};
    };
  });
  for (const offset of [0,1,2]) {
    await page.locator("#filesList").evaluate(function (el,offset) {el.scrollTop=offset;},offset);
    const result=await page.evaluate(function () {return LabelCheck();});
    assert.deepEqual(result.missing,[],"all visible filenames survive font metrics and row rounding at scroll "+offset);
  }
  await page.locator("#filesList").evaluate(function (el) {el.scrollTop=0;});
  const canvas=await page.locator("#canvas").boundingBox(),title=await page.locator("#filesWin .wtitle").boundingBox();
  await page.mouse.move(title.x+20,title.y+4);
  await page.mouse.down();
  await page.mouse.move(canvas.x+48*canvas.width/640,canvas.y+16*canvas.height/480,{steps:15});
  await page.mouse.up();
  await page.mouse.move(5,5);
  await page.waitForFunction(function () {
    return document.getElementById("filesWin").classList.contains("win-pass-owned") &&
      labelWindows.some(function (w) {return w.host=="filesWin";});
  },null,{timeout:30000});
  const seen=new Set;
  while (true) {
    try {
      await page.waitForFunction(function () {
        const result=LabelCheck(true);
        return result.names.length && !result.missing.length && !result.badPixels.length;
      },null,{timeout:15000});
    } catch (error) {
      console.error(await page.evaluate(function () {return LabelCheck(true);}));
      throw error;
    }
    const result=await page.evaluate(function () {return LabelCheck(true);});
    for (const name of result.names) seen.add(name);
    const more=await page.locator("#filesList").evaluate(function (el) {
      if (el.scrollTop+el.clientHeight>=el.scrollHeight) return false;
      el.scrollTop+=Math.max(1,Math.floor(el.clientHeight/2));
      el.dispatchEvent(new Event("scroll"));
      return true;
    });
    if (!more) break;
  }
  assert.deepEqual([...seen].sort(),entries.sort(),"every real C: filename appears as native font pixels while scrolling");
  await mkdir("tmp/gui",{recursive:true});
  await page.locator("#canvas").screenshot({path:"tmp/gui/native-file-labels.png"});
  assert.deepEqual(errors,[]);
  console.log("Files labels: every C: entry survives clipping and appears as exact native font pixels, including scrolled rows.");
} finally {
  await browser.close();server.closeAllConnections();
  await new Promise(function (resolve) {server.close(resolve);});
}
