import {MachineObserve} from "./Test/MachineObserve.mjs";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {readFile,mkdir} from "node:fs/promises";
await mkdir("tmp/gui",{recursive:true});
import {gzipSync} from "node:zlib";
import {chromium} from "playwright-core";

const root=new URL("..",import.meta.url),base=process.env.GUI_URL || "http://localhost:8195/",
  server=process.env.GUI_URL?null:spawn(process.execPath,["Misc/Server.mjs"],{cwd:root,
    env:{...process.env,PORT:"8195"},stdio:["ignore","pipe","inherit"]});
if (server) await once(server.stdout,"data");
const browser=await chromium.launch({executablePath:process.env.CHROMIUM ||
  "/usr/bin/chromium",headless:true,args:["--no-sandbox"]});
let page;
try {
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  if (!process.env.GUI_URL) await context.route("**/hemu/*.gz",async function (route) {
    const name=new URL(route.request().url()).pathname.split("/").pop();
    await route.fulfill({body:await readFile(new URL("hemu/"+name,root)),
      contentType:"application/gzip"});
  });
  await context.route("https://templeosweb-*.workers.dev/**",
    function (route) {
      if (new URL(route.request().url()).hostname.startsWith("templeosweb-files.")) route.continue();
      else route.abort();
    });
  const sent=[];
  await context.routeWebSocket(/templeosweb-presence\./,()=>{});
  await context.routeWebSocket(/templeosweb-chat\./,ws=>{
    ws.send(JSON.stringify({t:"hello",tag:"test",people:1,log:[]}));
    ws.onMessage(message=>{if(message=="ping")ws.send("pong");else sent.push(JSON.parse(message));});
  });
  await context.route("**/Apps/Search/Transcripts/**",route=>{
    if (route.request().url().endsWith("manifest.json")) return route.fulfill({json:{shards:[{f:"fixture.json.gz"}]}});
    return route.fulfill({contentType:"application/gzip",body:gzipSync(JSON.stringify([
      {t:"Native search fixture",d:"2017-01-01",f:"videos/fixture.mp4",n:60,s:[[1,"HolyC compiler inside TempleOS"]]}]))});
  });
  await MachineObserve(context,function () {
    localStorage.setItem("tos-settings",JSON.stringify({rate:30,repeat:false}));
    window.passEvents=[];window.passRequests=[];window.passWindows=[];
    window.passBuffers={};window.passFrames=0;window.passActions=[];
    const WorkerBase=window.Worker;
    window.Worker=class extends WorkerBase {
      postMessage(m,...args) {
        if (m.type=="run") window.inputCtrl=new Int32Array(m.controlSAB);
        return super.postMessage(m,...args);
      }
    };
    try {localStorage.setItem("tos-persistence",JSON.stringify({syncTabs:true,saveSession:true,saveWindows:true}));} catch {}
    const Base=window.SharedWorker;
    window.SharedWorker=class extends Base {
      constructor(...args) {
        super(...args);
        if (!String(args[0]).includes("MachineHub.js")) return;
        const Send=this.port.postMessage.bind(this.port);
        this.port.postMessage=function (envelope,...args) {
          const m=envelope.value;
          if (["post","request"].includes(envelope.op) &&
              (m.cmd=="windows" || m.cmd=="input" &&
                (m.keys.length || m.wheel || m.b)))
            window.passRequests.push(m);
          return Send(envelope,...args);
        };
        ObserveMachineEvents(this.port,function (e) {
          const m=e.data;
          if (m.cmd=="windows") {
            if(m.enabled===false)window.passEvents.push(m);
            window.passWindows=m.windows;
            window.passActions.push(...m.actions);
            for (const w of m.windows)
              if (w.buf)
                window.passBuffers[w.task]={buf:w.buf,w:w.w,h:w.h};
          } else if (m.cmd=="frame") {
            window.passPixels=m.buf;
            window.passFrames++;
          } else if (["guestReady","fileResult","settings","paused","error"].includes(m.cmd))
            window.passEvents.push(m);
        });
      }
    };
  });
  await context.route("**/Apps/Search/Videos.json",route=>route.fulfill({json:[
    {f:"videos/fixture.mp4",t:"Native Terry action",d:"2017-01-01"}]}));
  await context.route("https://archive.org/download/**",route=>route.abort());
  page=await context.newPage();
  page.on("crash",()=>console.error("PAGE CRASH"));
  const errors=[];
  page.on("pageerror",function (e) {errors.push(e.message);});
  let query="?single";
  if (process.env.WINPASS_SMP)
    query="";
  await page.goto(new URL(query,base).href,{waitUntil:"load"});
  await page.waitForFunction(function () {
    return window.passEvents.some(function (e) {return e.cmd=="guestReady" && e.ok;});
  },null,{timeout:60000});
  await page.locator("#settingsBtn").click();
  await page.locator("#nativeDrawing").check();
  await page.locator("#windowScale").selectOption("2");
  await page.locator("#windowPassthrough").check();
  await page.locator("#settingsClose").click();
  await page.waitForFunction(function () {
    return window.passWindows.length || window.passEvents.some(function (m) {
      return m.cmd=="fileResult" && !m.ok;
    });
  },null,{timeout:60000});
  assert(await page.evaluate(function () {return window.passWindows.length;}),
    "native window bridge must compile and publish window metadata");
  const r=await page.locator("#canvas").boundingBox(),scale=r.width/640;
  async function Transfer(id)
  {

    const r=await page.locator("#canvas").boundingBox(),scale=r.width/640;
    await page.locator("#"+id).waitFor();
    await page.evaluate(async function (id) {
      const {WinFocus}=await import("/Adam/WinMgr.js");WinFocus(document.getElementById(id));
    },id);
    const title=await page.locator("#"+id+" .wtitle").boundingBox();
    await page.mouse.move(title.x+Math.min(60,title.width/2),title.y+4);
    await page.mouse.down();await page.mouse.move(r.x+220*scale,r.y+100*scale,{steps:15});await page.mouse.up();
    await page.waitForFunction(id=>document.getElementById(id).classList.contains("win-pass-owned"),id,{timeout:30000});
    await page.waitForFunction(id=>window.passWindows.some(w=>w.host==id),id,{timeout:30000});
    await page.waitForTimeout(350);
  }
  async function Point(id,selector)
  {
    await page.waitForFunction(id=>window.passWindows.some(w=>w.host==id),id,{timeout:30000});
    await page.waitForFunction(selector=>{const el=document.querySelector(selector);return el && !el.disabled;},selector);
    const point=await page.evaluate(async function ({id,selector}) {
      const {GuiScene}=await import("/Adam/GuiBridge.js"),scene=GuiScene(document.getElementById(id)),
        target=document.querySelector(selector),action=[...scene.actions].find(([,el])=>el==target)?.[0],
        w=window.passWindows.find(w=>w.host==id),v=new DataView(scene.gui.buffer);
      for (let at=24;at<scene.gui.length;at+=32+v.getInt32(at+28,true))
        if (v.getInt32(at,true)==4 && v.getInt32(at+24,true)==action)
          return {x:w.x+8+v.getInt32(at+4,true)+v.getInt32(at+12,true)/2,
            y:w.y+8+v.getInt32(at+8,true)+v.getInt32(at+16,true)/2,id:action};
    },{id,selector});
    assert(point,"native action rectangle exists for "+selector);
    const rect=await page.locator("#canvas").boundingBox();
    return {x:rect.x+point.x*rect.width/640,y:rect.y+point.y*rect.height/480};
  }
  async function Button(id,selector)
  {
    const point=await Point(id,selector);
    await page.mouse.click(point.x,point.y);
    await page.waitForTimeout(350);
  }
  async function ReturnAll()
  {
    await page.evaluate(async()=>{const m=await import("/Adam/Os.js");await m.OsWinPassReturn();});
    await page.waitForFunction(()=>!document.querySelector(".win-pass-owned"));
    await page.evaluate(async()=>{const m=await import("/Adam/WinMgr.js");m.WinWorkspaceReset();});
  }
  async function Accept(id,selector,key)
  {
    const before=await page.evaluate(()=>window.passWindows.map(w=>w.num));
    await Button(id,selector);
    assert.equal(await page.evaluate(before=>window.passWindows.some(w=>!before.includes(w.num) && !w.host),before),false,
      "text editing stays in the existing native window");
    const count=await page.evaluate(()=>passActions.length);
    await page.keyboard.press(key);
    if (key=="Enter") await page.waitForFunction(count=>passActions.slice(count).some(a=>a.kind==6),count);
    await page.waitForTimeout(200);
  }
  async function Type(id,selector,value)
  {
    const before=await page.evaluate(()=>window.passWindows.map(w=>w.num));
    await Button(id,selector);
    assert.equal(await page.evaluate(before=>window.passWindows.some(w=>!before.includes(w.num) && !w.host),before),false,
      "inline editing must not create another native window");
    assert.equal(await page.evaluate(()=>document.activeElement.id),"canvas",
      "native editing keeps browser focus on the OS surface");
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+End");
    await page.keyboard.press("Control+x");
    const shifted={'"':"'",':':';','{':'[','}':']','<':',','>':'.','?':'/','_':'-','+':'=','!':'1','@':'2','#':'3','$':'4','%':'5','^':'6','&':'7','*':'8','(':'9',')':'0','|':'\\','~':'`'};
    for (const ch of value) {
      if (ch=="\n") await page.keyboard.press("Enter");
      else if (/[A-Z]/.test(ch) || shifted[ch]) {
        await page.keyboard.down("Shift");await page.keyboard.type(shifted[ch] || ch.toLowerCase());await page.keyboard.up("Shift");
      } else await page.keyboard.type(ch);
    }
    await page.waitForFunction(({selector,value})=>document.querySelector(selector).value==value,{selector,value});
    await page.screenshot({path:"tmp/gui/native-input.png"});
    const multiline=await page.locator(selector).evaluate(el=>el.tagName=="TEXTAREA");
    assert.equal(await page.evaluate(before=>window.passWindows.some(w=>!before.includes(w.num) && !w.host),before),false);
    if (!multiline) {
      const count=await page.evaluate(()=>passActions.length);
      await page.keyboard.press("Enter");
      await page.waitForFunction(count=>passActions.slice(count).some(a=>a.kind==6),count);
    }
  }
  await Transfer("desktopMenu");
  const menuChat=await Point("desktopMenu","#chatBtn");
  await page.mouse.click(menuChat.x,menuChat.y);
  await page.waitForFunction(()=>document.getElementById("chatWin")?.classList.contains("win-pass-owned"),null,{timeout:30000});
  await page.locator("#chatNick").evaluate(el=>{el.value="café💖";el.dispatchEvent(new Event("input",{bubbles:true}));});
  await page.waitForTimeout(350);
  await Accept("chatWin","#chatNick","Enter");
  assert.equal(await page.locator("#chatNick").inputValue(),"café💖","native CP437 and Unicode escapes preserve service values");
  await Type("chatWin","#chatNick","Bridge test");
  await page.locator("#canvas").evaluate(async el=>{await el.closest("#frame").requestFullscreen();el.focus();});
  await Type("chatWin","#chatText","Native input fixture");
  await page.waitForFunction(()=>document.getElementById("chatText").value=="");
  assert(sent.some(m=>m.text=="Native input fixture"),"native form submits to the local mocked chat socket");
  await page.keyboard.type("after submit");
  await page.waitForFunction(()=>document.getElementById("chatText").value=="after submit");
  await page.keyboard.press("Enter");
  await page.waitForFunction(()=>document.getElementById("chatText").value=="");
  assert(sent.some(m=>m.text=="after submit"),"submit clears the retained native document and keeps its focus for the next message");
  await page.evaluate(()=>document.exitFullscreen());
  await ReturnAll();await page.locator("#chatClose").click();

  await Transfer("terryWin");
  await page.waitForFunction(()=>window.passRequests.filter(m=>m.op=="update" && m.gui).length>=2);
  await page.waitForTimeout(500);
  const sprite=await page.evaluate(()=>{
    const w=window.passWindows.find(w=>w.host=="terryWin"),pixels=new Uint8Array(window.passPixels),colors=new Set;
    for (let y=w.y+16;y<w.y+w.h-40;y++) for (let x=w.x+8;x<w.x+w.w-8;x++) colors.add(pixels[y*640+x]);
    return [...colors];
  });
  assert(sprite.length>5,"Terry's indexed canvas is drawn by the real native task");
  await page.screenshot({path:"tmp/gui/native-terry.png"});
  await Button("terryWin","#terryRandom");
  await page.locator(".vidwin").waitFor();
  assert.match(await page.locator(".vidwin").innerText(),/Native Terry action/,
    "native Terry action opens the original browser video player");
  await page.locator(".vidwin .close").click();
  await page.locator("#settingsBtn").click();await page.locator("#returnWindows").click();
  await page.waitForFunction(()=>!document.querySelector(".win-pass-owned"));
  assert.equal(await page.locator("#windowPassthrough").isChecked(),true);
  await page.locator("#settingsClose").click();
  await page.locator("#terryWin .close").click();
  await Transfer("guide");await Button("guide","#cheatsheetBtn");
  await page.waitForFunction(()=>document.getElementById("cheatsheetWin")?.classList.contains("win-pass-owned"),null,{timeout:30000});
  const before=await page.locator(".cheatsheet-body").evaluate(el=>el.scrollTop);
  await page.keyboard.press("PageDown");
  await page.waitForFunction(before=>document.querySelector(".cheatsheet-body").scrollTop>before,before);
  await page.keyboard.press("End");
  await page.waitForFunction(()=>{const el=document.querySelector(".cheatsheet-body");return el.scrollTop+el.clientHeight>=el.scrollHeight-1;});
  await page.waitForTimeout(300);
  await page.screenshot({path:"tmp/gui/native-cheatsheet.png"});
  await page.locator("#settingsBtn").click();await page.locator("#returnWindows").click();
  await page.waitForFunction(()=>!document.querySelector(".win-pass-owned"));
  await page.locator("#cheatsheetClose").click();await page.locator("#settingsClose").click();
  await page.locator("#guide .close").click();
  await page.locator("#godBtn").click();await Transfer("godWin");
  await Button("godWin","#godWord");
  await page.waitForFunction(()=>!!document.querySelector("#godOut .word"));
  await page.locator("#settingsBtn").click();await page.locator("#returnWindows").click();
  await page.waitForFunction(()=>!document.querySelector(".win-pass-owned"));
  assert.equal(await page.locator("#windowPassthrough").isChecked(),true);
  assert.equal(await page.locator("#winPassDock").count(),0);
  await page.locator("#settingsClose").click();
  await page.locator("#godClose").click();


  await page.locator("#filesBtn").click();
  await page.waitForFunction(()=>document.getElementById("filesPath")?.disabled===false);
  await Transfer("filesWin");
  await Type("filesWin","#filesPath","C:/Home/");
  await page.waitForFunction(()=>document.getElementById("filesStatus").textContent.includes("items"));
  const chooser=page.waitForEvent("filechooser");
  await Button("filesWin","#filesImport");
  await (await chooser).setFiles({name:"NativeImport.HC",mimeType:"text/plain",buffer:Buffer.from('"Imported";')});
  await page.waitForFunction(()=>document.getElementById("filesStatus").textContent.includes("Imported 1"),null,{timeout:30000});
  const drop=await page.evaluateHandle(()=>{const data=new DataTransfer;data.items.add(new File(['"Dropped";'],"NativeDrop.HC",{type:"text/plain"}));return data;});
  const filewin=await page.evaluate(()=>window.passWindows.find(w=>w.host=="filesWin")),rect=await page.locator("#canvas").boundingBox();
  await page.locator("#canvas").dispatchEvent("drop",{dataTransfer:drop,clientX:rect.x+(filewin.x+filewin.w/2)*rect.width/640,clientY:rect.y+(filewin.y+filewin.h/2)*rect.height/480});
  await page.waitForFunction(()=>!!document.querySelector('#filesList button[data-name="NativeDrop.HC"]'),null,{timeout:30000});
  const icons=await page.evaluate(async()=>{
    const {GuiScene}=await import("/Adam/GuiBridge.js"),s=GuiScene(document.getElementById("filesWin")),v=new DataView(s.gui.buffer);let images=0;
    for(let at=24;at<s.gui.length;at+=32+v.getInt32(at+28,true))if(v.getInt32(at,true)==3)images++;
    return images;
  });
  assert(icons>=5,"file and toolbar SVG icons become real indexed image commands");
  await page.screenshot({path:"tmp/gui/native-files.png"});
  await Button("filesWin","#filesNew");
  await page.waitForFunction(()=>document.getElementById("editorWin")?.classList.contains("win-pass-owned"),null,{timeout:30000});
  await page.waitForFunction(()=>window.__holycEditor?.FileLoad && !document.getElementById("editor").disabled);
  await page.evaluate(()=>window.__holycEditor.FileLoad(Uint8Array.of(34,233,34,59),"Encoding.HC"));
  await page.waitForTimeout(350);
  await Accept("editorWin","#editor","Escape");
  assert.deepEqual(await page.evaluate(()=>Array.from(new Uint8Array(window.__holycEditor.FileBytes()))),[34,233,34,59],
    "accepting native source preserves its CP437 bytes instead of converting them to Unicode");
  await Type("editorWin","#editor",'"Native editor";\n"Second line";');
  assert.equal(await page.locator("#editor").inputValue(),'"Native editor";\n"Second line";');
  await page.waitForTimeout(500);await page.screenshot({path:"tmp/gui/native-editor.png"});
  await Button("editorWin","#runBtn");
  await page.waitForFunction(()=>document.getElementById("console").textContent.includes("Native editor"),null,{timeout:30000});
  await Button("editorWin","#edToDisk");
  await page.waitForFunction(()=>!!document.querySelector('[id^="dialog-"].win-pass-owned'));
  let dialog=await page.locator('[id^="dialog-"].win-pass-owned').getAttribute("id");
  await Type(dialog,'#'+dialog+' input',"C:/Home/GuiBridgeTest.HC");
  await page.waitForFunction(()=>document.getElementById("status").textContent=="Saved C:/Home/GuiBridgeTest.HC",null,{timeout:30000});
  const bytes=await page.evaluate(async()=>Array.from(new Uint8Array((await (await import("/Adam/Os.js")).OsFileRead("C:/Home/GuiBridgeTest.HC")).bytes)));
  assert.match(new TextDecoder().decode(new Uint8Array(bytes)),/Native editor/);
  await Button("editorWin","#edFiles");
  await page.waitForFunction(()=>document.getElementById("filesWin").classList.contains("win-pass-owned"));
  await Type("filesWin","#filesFilter","GuiBridgeTest");
  await page.waitForFunction(()=>document.querySelectorAll("#filesList button").length==1);
  let point=await Point("filesWin","#filesList button");
  await page.mouse.dblclick(point.x,point.y,{delay:120});
  await page.waitForFunction(()=>document.getElementById("status").textContent=="C:/Home/GuiBridgeTest.HC",null,{timeout:30000});
  await ReturnAll();await page.locator("#editorClose").click();await page.locator("#filesClose").click();

  await Transfer("desktopMenu");await Button("desktopMenu","#settingsBtn");
  await page.waitForFunction(()=>document.getElementById("settingsWin").classList.contains("win-pass-owned"),null,{timeout:30000});
  await Button("settingsWin","#showHeader");
  await page.waitForFunction(()=>document.documentElement.classList.contains("hide-header"));
  await Button("settingsWin","#showHeader");
  await page.waitForFunction(()=>!document.documentElement.classList.contains("hide-header"));
  const nativeBefore=await page.evaluate(()=>window.passWindows.map(w=>w.num));
  await Button("settingsWin","#windowScale");
  await page.waitForFunction(before=>window.passWindows.some(w=>!before.includes(w.num) && !w.host),nativeBefore);
  await page.keyboard.press("Home");await page.keyboard.press("Space");
  await page.waitForFunction(()=>document.getElementById("windowScale").value=="1");
  await ReturnAll();await page.locator("#settingsClose").click();

  await page.locator("#tsBtn").click();
  await page.waitForFunction(()=>document.querySelectorAll("#tsOut .ts-hit").length==1);
  await Transfer("tsWin");await Type("tsWin","#tsQ","HolyC");
  await page.waitForFunction(()=>document.querySelectorAll("#tsOut .ts-hit").length==1);
  point=await Point("tsWin","#tsHelp");await page.mouse.move(point.x,point.y);
  await page.waitForFunction(()=>getComputedStyle(document.getElementById("tsHelpPop")).display!="none");
  await page.screenshot({path:"tmp/gui/native-search.png"});
  await ReturnAll();await page.locator("#tsClose").click();

  await page.locator("#gamesBtn").click();await Transfer("gamesWin");
  await Type("gamesWin","#gmSearch","Babel");
  await page.waitForFunction(()=>document.querySelectorAll(".gm-card:not(.gm-hide)").length==1,null,{timeout:30000});
  await Button("gamesWin",".gm-card:not(.gm-hide) .gm-play");
  await page.waitForFunction(()=>document.getElementById("gameWin").classList.contains("win-pass-owned"),null,{timeout:30000});
  await page.waitForFunction(()=>window.__holycEditor?.isRunning(),null,{timeout:30000});
  await Button("gameWin","#screen");await page.keyboard.press("Enter");
  await page.evaluate(async()=>{window.control=(await import("/hemu/holyc-wasm/src/runtime/protocol.js")).CTRL;});
  point=await Point("gameWin","#screen");
  await page.mouse.move(point.x,point.y);await page.mouse.down();
  await page.waitForFunction(()=>Atomics.load(inputCtrl,control.MS_LB)==1);
  const gameTitle=await page.evaluate(()=>{const w=passWindows.find(w=>w.host=="gameWin"),r=document.getElementById("canvas").getBoundingClientRect();return{x:r.x+(w.x+12)*r.width/640,y:r.y+(w.y+4)*r.height/480};});
  await page.mouse.move(gameTitle.x,gameTitle.y);await page.mouse.up();
  await page.waitForFunction(()=>Atomics.load(inputCtrl,control.MS_LB)==0);
  await Button("gameWin","#screen");await page.keyboard.down("w");
  await page.waitForFunction(()=>passActions.some(a=>a.kind==7 && a.arg1==119));
  await page.locator("#canvas").evaluate(async el=>{await el.closest("#frame").requestFullscreen();el.focus();});
  await Button("gameWin","#gameWinCapture");
  await page.waitForFunction(()=>document.pointerLockElement?.id=="canvas" && passWindows.some(w=>w.host=="gameWin" && w.capture));
  await page.keyboard.up("w");
  await page.mouse.move(point.x+20,point.y+10);
  await page.waitForFunction(()=>passActions.some(a=>a.kind==12 && (a.x || a.y)));
  assert.equal(await page.evaluate(()=>document.activeElement.id),"canvas","native capture never focuses the hidden game canvas");
  await page.keyboard.press("Escape");
  await page.waitForFunction(()=>!document.pointerLockElement && !passWindows.some(w=>w.capture));
  assert(await page.evaluate(()=>passActions.some(a=>a.kind==11)),"native focus changes release backend held input");
  await page.evaluate(()=>document.fullscreenElement?document.exitFullscreen():undefined);
  await page.waitForTimeout(500);
  await page.screenshot({path:"tmp/gui/native-game.png"});
  assert.equal(await page.locator("#gameWin").evaluate(el=>el.classList.contains("win-pass-owned")),true);
  await ReturnAll();await page.locator("#gameWinClose").click();
  await page.evaluate(()=>document.getElementById("gamesOverlay").classList.remove("open"));
  await page.locator("#diskBtn").click();await Transfer("diskWin");
  await Button("diskWin","#saveSession");
  await page.waitForFunction(()=>/Session saved|C: changed/.test(document.getElementById("diskStatus").textContent),null,{timeout:60000});
  await ReturnAll();await page.locator("#diskClose").click();
  await page.locator("#settingsBtn").click();
  await page.locator("#windowPassthrough").uncheck();
  assert.deepEqual(errors,[]);
  console.log("PASS live GUI bridge: all compatible tools, native editing/save dialogs, SVG icons, double-clicks, hover, settings, child routing and browser game canvas; Return preserves passthrough");
} catch (error) {
  if (page) {
    console.error(error);
    console.error(await page.evaluate(()=>({events:window.passEvents.slice(-8),actions:window.passActions.slice(-20),
      status:document.getElementById("windowPassStatus")?.textContent,
      captures:window.passRequests.filter(m=>m.op=="capture"),
      requests:window.passRequests.filter(m=>m.cmd=="windows").slice(-15).map(({gui,...m})=>m),
      windows:window.passWindows.map(({buf,...w})=>w)})).catch(e=>({error:e.message})));
    await page.screenshot({path:"tmp/gui/native-error.png"});
  }
  throw error;
} finally {await browser.close();server?.kill();}
