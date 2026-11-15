import {WinAdd,WinFocus,WinWorkspaceReset} from "../../Adam/WinMgr.js";
import {$,OsCfg,OsCfgStatus,OsWinPassStatus,OsWinPassReturn,OsOnlyMode} from "../../Adam/Os.js";
import {WinDrawCfg} from "../../Adam/WinDraw.js";

WinAdd(`
#settingsWin { width:min(520px,94vw); margin:0; }
#settingsBody { display:flex; flex-direction:column; gap:16px;
  line-height:1.4; max-height:65dvh; overflow:auto; padding:3px; }
#settingsBody select { font:inherit; padding:6px; background:var(--white);
  color:var(--blue); border:2px solid var(--blue); }
#settingsBody input { width:18px; height:18px; vertical-align:middle; }
`, `
<div id="settingsOverlay" class="overlay" role="dialog" aria-modal="true"
  aria-label="Settings">
  <div id="settingsWin" class="win" data-title="Settings">
    <span id="settingsClose" class="close">[X]</span>
    <div id="settingsBody">
      <button id="resetWindows">Reset window positions</button>
      <p>Restore the default desktop layout. Open tools stay open.</p>
      <label><input id="showHeader" type="checkbox"> Show header introduction</label>
      <label><input id="showFooter" type="checkbox"> Show footer credits</label>
      <label><input id="nativeDrawing" type="checkbox"> Native window drawing</label>
      <p>Draw browser window borders with HolyC and TempleOS's own font.
        This works independently of the emulated machine.</p>
      <label for="windowScale">Window decoration scale (DPI)</label>
      <select id="windowScale">
        <option value="1">100%</option>
        <option value="1.25">125%</option>
        <option value="1.5">150%</option>
        <option value="1.75">175%</option>
        <option value="2">200%</option>
      </select>
      <p>Resize borders, titles and scroll handles.</p>
      <label><input id="windowPassthrough" type="checkbox"> Window passthrough</label>
      <button id="returnWindows">Return windows</button>
      <p id="onlyModeHint" hidden>Exit TempleOS Only Mode to return windows or turn passthrough off.</p>
      <p>Use a mouse to drag a TempleOS window's title out of the screen onto the
	browser desktop. Drag it back to return it. Compatible browser tools
	can also be dragged into TempleOS. Tools opened from a native window stay there.
	Pausing returns windows so browser controls stay available.</p>
      <p>Drag a browser window beyond the page edge to open it in a browser
        popup. Close the popup or choose Return to desktop to bring it back.
        Your browser may ask you to allow popups.</p>
      <p>Return windows brings them back without turning passthrough off.
        Video Player and Sprite Studio stay in the browser.</p>
      <p id="windowPassStatus" role="status"></p>
      <label><input id="fastGraphics" type="checkbox"> Web Optimization</label>
      <p>Uses drawing shortcuts for better performance.
	Turn off to run TempleOS's original drawing code.</p>
      <label for="frameRate">TempleOS refresh rate</label>
      <select id="frameRate">
        <option value="0">Uncapped</option>
        <option value="30">30 - original TempleOS timing</option>
        <option value="60">60</option>
        <option value="120">120</option>
      </select>
      <p>Uncapped runs as fast as the emulator can draw. Games that time
        their movement by Refresh run faster above 30; choose 30 for their
        original speed.</p>
      <label><input id="biosRepeat" type="checkbox"> BIOS key override:
        repeat held keys</label>
      <p>Repeats the last held key at the keyboard rate TempleOS requests.
        Useful for programs that read individual key presses.</p>
      <p id="settingsStatus" role="status"></p>
    </div>
  </div>
</div>`);

function Close()
{
  $("settingsOverlay").classList.remove("open","free");
}

export function Open()
{
  let cfg=OsCfg();
  $("showHeader").checked=!document.documentElement.classList.contains("hide-header");
  $("showFooter").checked=!document.documentElement.classList.contains("hide-footer");
  $("frameRate").value=String(cfg.rate);
  $("biosRepeat").checked=cfg.repeat;
  $("fastGraphics").checked=cfg.fast;
  $("nativeDrawing").checked=WinDrawCfg().native;
  $("windowScale").value=String(WinDrawCfg().scale);
  OnlyModeShow();
  $("windowPassStatus").textContent=OsWinPassStatus();
  $("settingsOverlay").classList.add("open");
  $("settingsOverlay").setAttribute("aria-modal","true");
  WinFocus($("settingsWin"));
  Status(OsCfgStatus());
}

function Status(state)
{
  $("settingsStatus").textContent=state.msg || "Settings applied.";
  if(typeof state.fast==="boolean")
    $("fastGraphics").checked=state.fast;
}
addEventListener("ossettings",function (e) {Status(e.detail);});
addEventListener("windrawsettings",function (e) {
  $("nativeDrawing").checked=e.detail.native;
  $("windowScale").value=String(e.detail.scale);
});
addEventListener("windrawerror",function (e) {Status({msg:e.detail});});
addEventListener("winpasssettings",function (e) {
  OnlyModeShow();
  $("windowPassStatus").textContent=e.detail.msg;
});
function OnlyModeShow()
{
  const on=OsOnlyMode();
  $("windowPassthrough").checked=on || OsCfg().pass;
  $("windowPassthrough").disabled=on;
  $("returnWindows").disabled=on;
  $("onlyModeHint").hidden=!on;
}
addEventListener("osonlymode",OnlyModeShow);
addEventListener("osrestored",function (e) {
  $("frameRate").value=String(e.detail.rate);
  $("biosRepeat").checked=e.detail.repeat;
  $("fastGraphics").checked=e.detail.fast;
});

$("resetWindows").addEventListener("click",function () {
  WinWorkspaceReset();
  Status({msg:"Window positions reset. Open tools stay open."});
});
$("returnWindows").addEventListener("click",async function () {
  try {await OsWinPassReturn();}
  catch (error) {Status({msg:error.message});}
});
addEventListener("winworkspaceerror",function (e) {Status({msg:e.detail});});

$("frameRate").addEventListener("change",function (e) {
  OsCfg({rate:Number(e.target.value)});
});
$("biosRepeat").addEventListener("change",function (e) {
  OsCfg({repeat:e.target.checked});
});
$("fastGraphics").addEventListener("change",function (e) {
  OsCfg({fast:e.target.checked});
});
$("nativeDrawing").addEventListener("change",function (e) {
  WinDrawCfg({native:e.target.checked});
});
$("windowScale").addEventListener("change",function (e) {
  WinDrawCfg({scale:Number(e.target.value)});
});
$("windowPassthrough").addEventListener("change",function (e) {
  OsCfg({pass:e.target.checked});
});
$("settingsClose").addEventListener("click",Close);
$("settingsOverlay").addEventListener("pointerdown",function (e) {
  if (e.target==e.currentTarget)
    Close();
});

for (const [id,part] of [["showHeader","header"],["showFooter","footer"]])
  $(id).addEventListener("change",function (e) {
    document.documentElement.classList.toggle("hide-"+part,!e.target.checked);
    try {
      localStorage.setItem("tos-show-"+part,String(e.target.checked));
    } catch (err) {
      $("settingsStatus").textContent="Display changed for this visit; browser storage is unavailable.";
    }
    dispatchEvent(new Event("resize"));
  });
