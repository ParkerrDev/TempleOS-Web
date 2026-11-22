import {WinAdd,WinFocus,WinWorkspaceReset} from "../../Adam/WinMgr.js";
import {$,OsCfg,OsCfgStatus,OsWinPassStatus,OsWinPassReturn,OsOnlyMode,OsOnlyReady} from "../../Adam/Os.js";
import {PersistenceCfg} from "../../Adam/Persistence.js";
import {WinDrawCfg} from "../../Adam/WinDraw.js";

WinAdd(`
#settingsWin { width:min(560px,94vw); margin:0; }
#settingsBody { display:flex; flex-direction:column; gap:18px;
  line-height:1.4; max-height:65dvh; overflow:auto; padding:3px; }
#settingsBody .st-section { display:flex; flex-direction:column; gap:10px;
  border-top:3px double var(--blue); padding-top:12px; min-width:0; }
#settingsBody .st-section:first-child { border-top:0; padding-top:0; }
#settingsBody h3 { color:var(--red); font:inherit; }
#settingsBody label { display:flex; align-items:center; gap:8px; }
#settingsBody input { width:18px; height:18px; flex:0 0 18px; margin:0; }
#settingsBody select { font:inherit; padding:6px; max-width:100%; background:var(--white);
  color:var(--blue); border:2px solid var(--blue); }
#settingsBody .st-choice { display:flex; align-items:center; flex-wrap:wrap; gap:8px; }
#settingsBody .st-choice label { flex:1; }
#settingsBody .st-actions { display:flex; flex-wrap:wrap; gap:8px; }
#settingsBody button { white-space:normal; height:auto; line-height:1.3; padding:6px; }
#settingsBody .st-actions button { flex:1 1 190px; }
#settingsBody .st-note,#settingsBody details { font-size:12px; }
#settingsBody summary { cursor:pointer; width:fit-content; }
#settingsBody summary:focus-visible { outline:2px solid var(--blue); outline-offset:2px; }
#settingsBody details[open] summary { margin-bottom:8px; }
#settingsBody details p+p { margin-top:8px; }
#settingsBody details:not([open])>:not(summary) { display:none; }
#settingsBody [role=status]:empty { display:none; }
`, `
<div id="settingsOverlay" class="overlay" role="dialog" aria-modal="true"
  aria-label="Settings">
  <div id="settingsWin" class="win" data-title="Settings">
    <span id="settingsClose" class="close">[X]</span>
    <div id="settingsBody">
      <section class="st-section" aria-labelledby="stWindows">
        <h3 id="stWindows">Windows</h3>
        <button id="onlyBtn" title="Move open tools into TempleOS and fill the browser" aria-pressed="false" disabled>TempleOS Only Mode</button>
        <label><input id="windowPassthrough" type="checkbox"> Window passthrough</label>
        <label><input id="saveWindows" type="checkbox"> Remember window positions</label>
        <div class="st-actions">
          <button id="returnWindows">Return windows</button>
          <button id="resetWindows">Reset window positions</button>
        </div>
        <p id="onlyModeHint" class="st-note" hidden>Exit TempleOS Only Mode to return windows or turn passthrough off.</p>
        <p id="windowPassStatus" class="st-note" role="status"></p>
        <details>
          <summary>How windows work</summary>
          <p>Passthrough lets you drag windows between TempleOS and the page. Tools opened inside TempleOS stay there. Video Player and Sprite Studio stay in the browser.</p>
          <p>Remember window positions also restores sizes and open windows. Return windows keeps passthrough enabled. Reset positions keeps tools open.</p>
          <p>On desktop, drag a window beyond the page edge to open a browser popup. Close it to return the window.</p>
        </details>
      </section>
      <section class="st-section" aria-labelledby="stSaving">
        <h3 id="stSaving">Saving &amp; tabs</h3>
        <p class="st-note">Files on C: save automatically.</p>
        <label><input id="syncTabs" type="checkbox"> Sync tabs</label>
        <label><input id="rememberSession" type="checkbox"> Save full session</label>
        <p class="st-note">Refresh tabs to apply these changes.</p>
        <details>
          <summary>What gets saved?</summary>
          <p>A full session also preserves running tasks and TempleOS windows. Without it, you start with a fresh desktop and your saved files.</p>
          <p>Sync shares one running machine when multiple tabs are open. When off, only one tab can save C:.</p>
        </details>
      </section>
      <section class="st-section" aria-labelledby="stAppearance">
        <h3 id="stAppearance">Appearance</h3>
        <label><input id="showHeader" type="checkbox"> Show header</label>
        <label><input id="showFooter" type="checkbox"> Show footer</label>
        <label><input id="nativeDrawing" type="checkbox"> Native window drawing</label>
        <div class="st-choice">
          <label for="windowScale">Window scale (DPI)</label>
          <select id="windowScale">
            <option value="1">100%</option>
            <option value="1.25">125%</option>
            <option value="1.5">150%</option>
            <option value="1.75">175%</option>
            <option value="2">200%</option>
          </select>
        </div>
        <details>
          <summary>About window drawing</summary>
          <p>Uses HolyC and TempleOS's font to draw browser window borders. Scale changes borders, titles and scroll handles.</p>
        </details>
      </section>
      <section class="st-section" aria-labelledby="stPerformance">
        <h3 id="stPerformance">Performance &amp; input</h3>
        <label><input id="fastGraphics" type="checkbox"> Web Optimization</label>
        <div class="st-choice">
          <label for="frameRate">Refresh rate</label>
          <select id="frameRate">
            <option value="0">Uncapped</option>
            <option value="30">30 FPS (original)</option>
            <option value="60">60 FPS</option>
            <option value="120">120 FPS</option>
          </select>
        </div>
        <label><input id="biosRepeat" type="checkbox"> Repeat held keys</label>
        <details>
          <summary>About performance &amp; keys</summary>
          <p>Web Optimization uses faster replacements for selected drawing routines. Turn it off to run the original instructions.</p>
          <p>Uncapped draws as fast as possible. Use 30 FPS for games that rely on TempleOS's original timing.</p>
          <p>Repeat held keys overrides BIOS key handling for programs that read individual key presses.</p>
        </details>
      </section>
      <p id="settingsStatus" class="st-note" role="status"></p>
    </div>
  </div>
</div>`);

function Close()
{
  $("settingsOverlay").classList.remove("open","free");
}

export function Open()
{
  let cfg=OsCfg(),draw=WinDrawCfg();
  $("showHeader").checked=!document.documentElement.classList.contains("hide-header");
  $("showFooter").checked=!document.documentElement.classList.contains("hide-footer");
  $("frameRate").value=String(cfg.rate);
  $("biosRepeat").checked=cfg.repeat;
  $("fastGraphics").checked=cfg.fast;
  $("nativeDrawing").checked=draw.native;
  $("windowScale").value=String(draw.scale);
  PersistenceShow();
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
  $("onlyBtn").disabled=!OsOnlyReady();
  $("onlyBtn").setAttribute("aria-pressed",String(on));
  $("onlyBtn").textContent=on?"Exit TempleOS Only Mode":"TempleOS Only Mode";
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

$("onlyBtn").addEventListener("click",function () {OsOnlyMode(!OsOnlyMode());});
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

function PersistenceShow()
{
  const cfg=PersistenceCfg();
  for (const [id,key] of [["syncTabs","syncTabs"],["rememberSession","saveSession"],["saveWindows","saveWindows"]])
    $(id).checked=cfg[key];
}
for (const [id,key] of [["syncTabs","syncTabs"],["rememberSession","saveSession"],["saveWindows","saveWindows"]])
  $(id).addEventListener("change",function (e) {
    Status({msg:key==="saveWindows"?"Window preference applied.":"Preference saved. Refresh your tabs to apply it."});
    PersistenceCfg({[key]:e.target.checked});
  });
addEventListener("persistencesettings",PersistenceShow);
addEventListener("persistenceerror",e=>Status({msg:e.detail}));
