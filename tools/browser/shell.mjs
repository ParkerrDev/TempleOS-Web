import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {chromium} from "playwright-core";

const root=new URL("../../",import.meta.url).pathname,
  server=spawn(process.execPath,["server.mjs"],{cwd:root,
    env:{...process.env,PORT:"8181"},stdio:["ignore","pipe","inherit"]});
await once(server.stdout,"data");
const browser=await chromium.launch({executablePath:process.env.CHROMIUM ||
  "/usr/bin/chromium",headless:true,args:["--no-sandbox"]});
let contexts=[];
try {
  for (const mobile of [false,true]) {
    const context=await browser.newContext({viewport:mobile ?
      {width:390,height:844}:{width:1280,height:800},
      hasTouch:mobile,isMobile:mobile,deviceScaleFactor:mobile?3:1,
      reducedMotion:mobile?"reduce":"no-preference"});
    contexts.push(context);
    //The shell must work while the independent OS download has not finished.
    await context.route("**/hemu/*.gz",function (route) {route.abort();});
    await context.route("https://templeosweb-*.workers.dev/**",
      function (route) {route.abort();});
    const page=await context.newPage(),errors=[];
    page.on("pageerror",function (e) {errors.push(e.message);});
    await page.goto("http://localhost:8181/",{waitUntil:"load"});
    await page.locator("#frame .wbar").waitFor();
    await page.waitForFunction(function () {
      return !document.documentElement.classList.contains("fontwait");
    });
    assert.equal(await page.locator("#guide").isVisible(),!mobile);
    assert.equal(await page.locator("#terryWin").isVisible(),!mobile);
    assert.equal(await page.locator("#guide #terrySprite").count(),0);
    assert.equal(await page.locator("#helpQuotes,#helpSource").count(),0);
    assert.deepEqual(await page.locator("#guide button").allTextContents(),["Next tip"]);
    for(const direction of ["Left","Right","Up","Down"])
      assert.equal(await page.locator('[data-key="Arrow'+direction+'"]').isVisible(),mobile);
    if(!mobile) {
      await page.waitForFunction(()=>document.getElementById("terrySprite").dataset.format==="TempleOS GR");
      const first=await page.locator("#terrySprite").evaluate(canvas=>canvas.toDataURL());
      await page.waitForFunction(first=>document.getElementById("terrySprite").toDataURL()!==first,first);
      assert.equal(Math.round((await page.locator("#terrySprite").boundingBox()).height),176);
    }
    if (mobile)
      await page.locator("#mobileMenu").click();
    assert.equal(await page.locator("#touchBtn").isVisible(),mobile);
    await page.locator("#godBtn").click();
    await page.locator("#godWord").click();
    await page.locator("#godOut .word").waitFor();
    assert((await page.locator("#godOut").innerText()).trim());
    await page.locator("#godPassage").click();
    await page.locator("#godOut article").waitFor();
    assert((await page.locator("#godOut article h3").innerText()).length>3);
    assert.equal(await page.locator("#godStatus").innerText(),"");
    await page.locator("#godClear").click();
    assert.equal(await page.locator("#godOut").innerText(),"");
    const bounds=await page.locator("#godWin").boundingBox();
    assert(bounds.x>=0 && bounds.x+bounds.width<=await page.evaluate(()=>innerWidth));
    //Content may scroll, border gestures must not be stolen by browser panning.
    assert.equal(await page.locator("#godWin .wbar").evaluate(
      e=>getComputedStyle(e).touchAction),"none");
    assert.equal(await page.locator("#godOut").evaluate(
      e=>getComputedStyle(e).touchAction),"auto");
    if (mobile) {
      const cdp=await context.newCDPSession(page),title=await page.locator(
        "#godWin .wtitle").boundingBox(),x=title.x+title.width/2,y=title.y+6;
      await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",
        touchPoints:[{x,y}]});
      await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",
        touchPoints:[{x:x+24,y:y-48}]});
      await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
      const moved=await page.locator("#godWin").boundingBox();
      assert(Math.abs(moved.y-(bounds.y-48))<2,"touch drags the tool title");
      //Make a long document, then swipe its content through browser touch input.
      await page.locator("#godOut").evaluate(e=>{e.textContent="line\n".repeat(500);e.style.whiteSpace="pre";});
      const r=await page.locator("#godOut").boundingBox();
      await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",
        touchPoints:[{x:r.x+r.width/2,y:r.y+r.height-20}]});
      for (let n=1;n<=8;n++)
        await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",
          touchPoints:[{x:r.x+r.width/2,y:r.y+r.height-20-n*15}]});
      await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
      await page.waitForFunction(()=>document.getElementById("godOut").scrollTop>0);
      assert(Math.abs((await page.locator("#godWin").boundingBox()).y-moved.y)<2,
        "swiping content does not move the window");
    } else {
      const corner=await page.locator("#godWin .wszcorner").boundingBox();
      await page.mouse.move(corner.x+6,corner.y+6);
      assert.equal(await page.locator("#godWin .wszcorner").evaluate(
        e=>getComputedStyle(e).cursor),"nwse-resize");
      await page.mouse.down();
      await page.mouse.move(corner.x+54,corner.y+30);
      await page.mouse.up();
      const changed=await page.locator("#godWin").boundingBox();
      assert.equal(Math.round(changed.width-bounds.width),48);
      assert.equal(Math.round(changed.height-bounds.height),24);
    }
    await page.locator("#godClose").focus();
    await page.keyboard.press("Enter");
    assert.equal(await page.locator("#godWin").isVisible(),false);
    if (mobile)
      await page.locator("#mobileHelp").click();
    else
      await page.locator("#helpBtn").click();
    assert.equal(await page.locator("#helpContext").innerText(),"God Tools");
    const tip=await page.locator("#helpText").innerText();
    await page.locator("#helpNext").click();
    assert.notEqual(await page.locator("#helpText").innerText(),tip);
    await page.evaluate(()=>document.dispatchEvent(new CustomEvent("helpcontext",{detail:{id:"spritesBtn"}})));
    assert.equal(await page.locator("#helpNext").isVisible(),false);
    await page.evaluate(()=>document.dispatchEvent(new CustomEvent("helpcontext",{detail:{id:"godBtn"}})));
    assert.equal(await page.locator("#helpNext").isVisible(),true);
    await page.locator("#guide .close").click();
    if(!mobile) {
      assert.equal(await page.locator("#terryWin").isVisible(),true,"closing Help leaves Terry visible");
      await page.emulateMedia({reducedMotion:"reduce"});
      for(let n=0;n<5;n++)await page.locator("#terrySprite").click();
      const actor=page.locator("#terryEgg .egg-actor");
      await actor.waitFor();
      assert.equal(await page.locator("#terryEgg .egg-sound").getAttribute("aria-pressed"),"false");
      assert.equal(await actor.innerText(),"PARROT");
      assert.equal(await actor.locator("img").count(),0);
      await actor.focus();await page.keyboard.press("Enter");
      assert.equal(await actor.getAttribute("aria-label"),"Catch the glowie");
      for(let n=0;n<3;n++)await page.keyboard.press("Enter");
      assert.match(await page.locator("#terryEgg .egg-label").innerText(),/complete/);
      await page.locator("#terryWin .close").click();
      assert.equal(await page.locator("#terryEgg").count(),0);
      await page.locator("#desktopMenu").getByRole("button",{name:"Terry",exact:true}).click();
      assert.equal(await page.locator("#terryWin").isVisible(),true);
      await page.emulateMedia({reducedMotion:"no-preference"});
    }
    await page.evaluate(async function () {
      const {KeyInput,KeyBar}=await import("/Keyboard.js");
      const bar=document.createElement("div");
      bar.id="input-check";
      bar.style.cssText="position:fixed;left:10px;top:60px;z-index:99999;background:white";
      bar.innerHTML="<button>Ctrl</button><button>F2</button>";
      document.body.append(bar);
      window.inputBytes=[];
      const input=KeyInput(part=>window.inputBytes.push(...part));
      window.inputHeld=input.held;
      window.inputReset=KeyBar(bar,input);
    });
    const ctrl=page.locator("#input-check button").nth(0),
      f2=page.locator("#input-check button").nth(1);
    await ctrl.click();
    const keyBox=await f2.boundingBox();
    await page.mouse.move(keyBox.x+keyBox.width/2,keyBox.y+keyBox.height/2);
    await page.mouse.down();
    await page.waitForTimeout(140);
    assert.deepEqual(await page.evaluate(()=>window.inputHeld()),[0x1D,0x3C],
      "screen keys stay down for the entire press");
    await page.mouse.up();
    assert.deepEqual(await page.evaluate(()=>window.inputBytes),[0x1D,0x3C,0xBC,0x9D]);
    await page.evaluate(()=>window.inputBytes=[]);
    await f2.focus();
    await page.keyboard.press("Space");
    assert.deepEqual(await page.evaluate(()=>window.inputBytes),[0x3C,0xBC],
      "keyboard activation sends a single press");
    await ctrl.click();
    await page.evaluate(()=>window.inputReset());
    assert.deepEqual(await page.evaluate(()=>window.inputHeld()),[]);
    assert.equal(await ctrl.getAttribute("aria-pressed"),"false");
    await page.locator("#input-check").evaluate(e=>e.remove());
    if (mobile) {
      assert(await page.locator("#keysbar").isVisible());
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
      await page.setViewportSize({width:844,height:390});
      await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);
      assert(await page.locator("#mobileMenu").isVisible());
      const cdp=await context.newCDPSession(page),left=page.locator("#tL");
      await page.locator("#fsBtn").evaluate(e=>e.click());
      await page.waitForFunction(()=>document.getElementById("frame").classList.contains("fsmode"));
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(
        ()=>requestAnimationFrame(resolve))));
      await left.waitFor({state:"visible"});
      assert.equal(await page.locator('#keysbar').evaluate(e=>document.getElementById('frame').contains(e)),true,
        'OS fullscreen keeps the Keys window inside its fullscreen element.');
      assert.equal(await page.locator('#mobInput').evaluate(e=>document.getElementById('frame').contains(e)),true,
        'The phone keyboard input remains focusable inside fullscreen.');
      const box=await left.boundingBox();
      await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",
        touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2}]});
      assert(await left.evaluate(e=>e.classList.contains("on")));
      await cdp.send("Input.dispatchTouchEvent",{type:"touchCancel",touchPoints:[]});
      assert.equal(await left.evaluate(e=>e.classList.contains("on")),false,
        "cancelled touch releases the mouse button");
    } else {
      await page.locator("#editorBtn").click();
      await page.waitForFunction(()=>window.__holycEditor);
      await page.evaluate(()=>window.__holycEditor.stop());
      for (const source of ['"FORBIDDEN_EXECUTION\\n";\nI64 broken=;',
          '"FORBIDDEN_EXECUTION\\n";\nNoSuchFunction();']) {
        await page.locator("#editor").fill(source);
        await page.locator("#runBtn").click();
        await page.waitForFunction(()=>document.getElementById("status").textContent=="error");
        assert(!(await page.locator("#console").innerText()).includes("FORBIDDEN_EXECUTION"),
          "A malformed or unsupported program must not execute its valid prefix.");
      }
      await page.locator("#editor").fill('"VALID\\n"; CDC *dc=DCAlias; '+
        'dc->color=RED; GrRect(dc,17,19,3,4); Refresh; DCDel(dc);');
      await page.locator("#runBtn").click();
      await page.waitForFunction(()=>document.getElementById("status").textContent=="done");
      assert.match(await page.locator("#console").innerText(),/VALID/);
      const pixel=await page.locator("#screen").evaluate(c=>{
        const scale=c.width/640;
        return [...c.getContext("2d").getImageData(17*scale,19*scale,1,1).data];
      });
      assert.deepEqual(pixel,[170,0,0,255],"Native CDC pixels reach the browser without palette loss.");
      await page.locator("#editor").fill('"INPUT_READY\\n"; I64 i; '+
        'for(i=0;i<3;i++) "%d\\n",GetChar(,FALSE);');
      await page.locator("#runBtn").click();
      await page.waitForFunction(()=>document.getElementById("console").textContent.includes("INPUT_READY"));
      await page.locator("#screen").focus();
      await page.keyboard.press("Shift+Escape");
      await page.keyboard.press("Shift+Space");
      await page.keyboard.press("a");
      await page.waitForFunction(()=>document.getElementById("status").textContent=="done");
      assert.match(await page.locator("#console").innerText(),/28\n31\n97/,
        "Shift+Escape and Shift+Space reach native GetChar with TempleOS character values.");
      let releaseFormatter;
      const formatterGate=new Promise(resolve=>{releaseFormatter=resolve;});
      await page.route("**/holyc-fmt/HolyCFmt.HC",async route=>{
        await formatterGate;
        await route.continue();
      });
      const formatterRequest=page.waitForRequest("**/holyc-fmt/HolyCFmt.HC");
      await page.locator("#editor").fill('U0 Before()\n{\n}\n');
      await page.locator("#edFmt").click();
      await formatterRequest;
      await page.locator("#editor").fill('U0 After()\n{\n}\n');
      releaseFormatter();
      await page.waitForFunction(()=>document.getElementById("status").textContent.startsWith("Source changed."));
      assert.equal(await page.locator("#editor").inputValue(),'U0 After()\n{\n}\n',
        "Formatting cannot overwrite edits made while its program is loading.");
      await page.unroute("**/holyc-fmt/HolyCFmt.HC");
      await page.locator("#editor").fill('U0 Example()\n{\n"é Ç ╬ 🚀";\n}\n');
      await page.locator("#edFmt").click();
      await page.waitForFunction(()=>document.getElementById("status").textContent=="formatted ✓");
      assert.equal(await page.locator("#editor").inputValue(),
        'U0 Example()\n{\n  "é Ç ╬ 🚀";\n}\n');
      await page.locator("#editorClose").click();
      await page.locator("#fsBtn").click();
      await page.waitForFunction(()=>document.fullscreenElement?.id=="frame");
      const fullscreen=await page.locator("#frame").evaluate(el=>({
        border:getComputedStyle(el).borderImageSource,background:getComputedStyle(el).backgroundColor}));
      assert.deepEqual(fullscreen,{border:"none",background:"rgb(0, 0, 0)"});
      assert.equal(await page.locator("#fsExit").isVisible(),false);
      await page.waitForFunction(()=>document.getElementById("frame").classList.contains("fsmode"));
      const point=await page.evaluate(()=>{
        const frame=document.getElementById("frame"),r=document.getElementById("canvas").getBoundingClientRect(),
          x=Math.max(4,r.x/2),y=r.y+r.height/2;
        return {x,y,target:document.elementFromPoint(x,y).id,floating:frame.dataset.floating || ""};
      });
      assert.equal(point.target,"frame","The input check clicks the fullscreen margin.");
      await page.evaluate(()=>dispatchEvent(new Event("blur")));
      await page.mouse.click(point.x,point.y);
      assert.match(await page.locator("#tb-key").innerText(),/KEYS → OS/,
        "Fullscreen letterbox clicks retain OS keyboard focus.");
      assert.equal(await page.locator("#canvas").evaluate(el=>document.activeElement==el),true);
      assert.equal(await page.locator("#frame").evaluate(el=>el.dataset.floating || ""),point.floating,
        "Fullscreen margins cannot start a window drag.");
    }
    assert.deepEqual(errors,[]);
    await context.close();
  }
  console.log("Browser shell: desktop/mobile buttons, chunked passages, touch "+
    "drag versus scroll, resize, held keys, touch cancellation, contextual tips, landscape, "+
    "strict editor rejection and native CDC display passed.");
} finally {
  await browser.close();
  server.kill();
}
