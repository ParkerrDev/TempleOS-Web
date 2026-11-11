import {WinAdd,WinFocus} from "./WinMgr.js";
import {$,OsCfg,OsCfgStatus} from "./Os.js";

WinAdd(`
#settingsWin { width:min(520px,94vw); margin:0; }
#settingsBody { display:flex; flex-direction:column; gap:16px;
  line-height:1.4; max-height:65dvh; overflow:auto; }
#settingsBody select { font:inherit; padding:6px; background:var(--white);
  color:var(--blue); border:2px solid var(--blue); }
#settingsBody input { width:18px; height:18px; vertical-align:middle; }
`, `
<div id="settingsOverlay" class="overlay" role="dialog" aria-modal="true"
  aria-label="Settings">
  <div id="settingsWin" class="win" data-title="Settings">
    <span id="settingsClose" class="close">[X]</span>
    <div id="settingsBody">
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
  $("frameRate").value=String(cfg.rate);
  $("biosRepeat").checked=cfg.repeat;
  $("settingsOverlay").classList.add("open");
  $("settingsOverlay").setAttribute("aria-modal","true");
  WinFocus($("settingsWin"));
  Status(OsCfgStatus());
}

function Status(state)
{
  $("settingsStatus").textContent=state.msg || "Settings applied.";
}
addEventListener("ossettings",function (e) {Status(e.detail);});
addEventListener("osrestored",function (e) {
  $("frameRate").value=String(e.detail.rate);
  $("biosRepeat").checked=e.detail.repeat;
});

$("frameRate").addEventListener("change",function (e) {
  OsCfg({rate:Number(e.target.value)});
});
$("biosRepeat").addEventListener("change",function (e) {
  OsCfg({repeat:e.target.checked});
});
$("settingsClose").addEventListener("click",Close);
$("settingsOverlay").addEventListener("pointerdown",function (e) {
  if (e.target==e.currentTarget)
    Close();
});
