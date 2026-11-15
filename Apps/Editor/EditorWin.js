//The HolyC editor: HolyC compiled to WebAssembly and run in a worker
//(Apps/Editor/App.js, loaded on first open), and the window games run in, which
//shares the editor's screen and runner.
import {Icon} from "../../Adam/Icons.js";
import {WinAdd,WinRaise,WinFind} from "../../Adam/WinMgr.js";
import {os_game,OsFileWrite} from "../../Adam/Os.js";
import {setupGameViews} from "../Games/GameView.js";

const CSS='    #editorWin { display:flex; flex-direction:column; gap:6px; width:min(1180px,96vw); height:min(88vh,840px); margin:0; padding:8px; }\n'+
  '    .ed-bar { display:flex; flex-wrap:wrap; gap:7px; align-items:center; flex:0 0 auto; }\n'+
  '    .ed-bar button { display:inline-flex; align-items:center; gap:5px; }\n'+
  '    #editorWin .ed-bar button { width:auto; text-align:center; min-height:34px; }\n'+
  '    #editorWin select { width:auto; max-width:300px; height:var(--ctlh); font-size:12px; color:#000; background:#fff; border:2px solid #fff; outline:2px solid #000; padding:4px 6px; }\n'+
  '    #editorWin #status { margin-left:auto; color:var(--blue); font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:42%; }\n'+
  '    .ed-body { flex:1 1 auto; min-height:0; display:flex; gap:6px; }\n'+
  '    .ed-pane { flex:1 1 0; min-width:0; display:flex; flex-direction:column; border:3px double var(--blue); background:#fff; }\n'+
  '    .ed-h { flex:0 0 auto; background:var(--blue); color:#fff; padding:2px 7px; font-size:12px; letter-spacing:0; }\n'+
  '    .ed-screenhead { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:4px; }\n'+
  '    .ed-screenhead button { display:inline-flex; align-items:center; gap:5px; width:auto; padding:3px 6px; font-size:11px; }\n'+
  '    .preview-actions { display:flex; flex-wrap:wrap; gap:7px; }\n'+
  '    .ed-editwrap { position:relative; flex:1 1 auto; min-height:0; overflow:hidden; background:#fff; }\n'+
  '    #editorHL, #editor { position:absolute; inset:0; margin:0; border:0; padding:6px 8px; box-sizing:border-box;\n'+
  '        font-family:\'TempleOS\',\'dos_vga\',monospace; font-size:12px; line-height:1.0; letter-spacing:0; tab-size:8; white-space:pre; overflow:auto; }\n'+
  '    #editorHL { z-index:0; pointer-events:none; overflow:hidden; color:#16163a; background:transparent; }\n'+
  '    #editor { z-index:1; resize:none; outline:none; color:transparent; background:transparent; caret-color:#16163a; }\n'+
  '    #editor::selection { background:rgba(110,160,255,.4); }\n'+
  '    .ed-editwrap.plain #editorHL { display:none; }\n'+
  '    .ed-editwrap.plain #editor { color:#16163a; }\n'+
  '    #editorHL .tc{ color:#7d8aa0; font-style:italic; }  #editorHL .ts{ color:#0a7f25; }\n'+
  '    #editorHL .tk{ color:#a10608; font-weight:bold; }   #editorHL .tt{ color:#6a1b9a; }\n'+
  '    #editorHL .tco{ color:#b35a00; }  #editorHL .tn{ color:#b35a00; }  #editorHL .tp{ color:#0a6a8a; }\n'+
  '    .ed-screenwrap { flex:1 1 auto; min-height:0; background:#000; display:flex; justify-content:center; align-items:center; padding:4px; }\n'+
  '    #editorWin #screen { display:block; height:min(44vh,430px); width:auto; max-width:100%; aspect-ratio:4/3; image-rendering:pixelated; background:#000; }\n'+
  '    #editorWin #console { flex:0 1 100px; min-height:54px; margin:0; overflow:auto; padding:5px 8px; background:#000; color:var(--green); font-size:12px; line-height:1.0; white-space:pre-wrap; word-break:break-word; }\n'+
  '    .ed-foot { flex:0 0 auto; color:var(--blue); font-size:12px; padding:1px 2px 0; }\n'+
  '    /* ---- game mode: editor overlay shows just a big canvas (driven by the Games launcher) ---- */\n'+
  '    #gameBack, #gameRun, #gameStop, #gameToDisk { display:none; width:auto; } #gameTitle { display:none; color:var(--blue); align-self:center; padding:0 6px; }\n'+
  '    #editorOverlay.gamemode #gameBack { display:inline-flex; }\n'+
  '    #editorOverlay.gamemode #gameRun { display:inline-flex; }\n'+
  '    #editorOverlay.gamemode #gameToDisk { display:inline-flex; }\n'+
  '    #editorOverlay.gamemode #gameTitle { display:inline; }\n'+
  '    #editorOverlay.gamemode #demoSelect, #editorOverlay.gamemode #edFmt, #editorOverlay.gamemode #edSave,\n'+
  '    #editorOverlay.gamemode #edOpen, #editorOverlay.gamemode #edToDisk { display:none; }\n'+
  '    #editorOverlay.gamemode .ed-pane:first-child { display:none; }      /* hide the source pane */\n'+
  '    #editorOverlay.gamemode .ed-pane .ed-h, #editorOverlay.gamemode #console { display:none; }\n'+
  '    #editorOverlay.gamemode .ed-pane { border:0; }\n'+
  '    #editorOverlay.gamemode #screen { width:640px; height:480px; max-width:none; aspect-ratio:auto; }   /* native 640x480 game window, like TempleOS */\n'+
  '    #gameFile, #gameRestore, #gameDraft { display:none; }\n'+
  '    #editorOverlay.gameproject #gameBack, #editorOverlay.gameproject #gameRun, #editorOverlay.gameproject #gameStop, #editorOverlay.gameproject #gameToDisk,\n'+
  '    #editorOverlay.gameproject #gameTitle, #editorOverlay.gameproject #gameFile, #editorOverlay.gameproject #gameRestore,\n'+
  '    #editorOverlay.gameproject #gameDraft { display:inline-block; }\n'+
  '    #editorOverlay.gameproject #demoSelect, #editorOverlay.gameproject #runBtn, #editorOverlay.gameproject #edToDisk { display:none; }\n'+
  '    #editorOverlay.gameproject .ed-pane { min-height:0; }\n'+
  '    #gamePreviewStatus { display:none; }\n'+
  '    #editorOverlay.gameproject #gamePreviewStatus { display:block; flex:0 0 auto; padding:5px; font-size:11px; overflow-wrap:anywhere; }\n'+
  '    #editorOverlay.gameproject .ed-screenwrap { flex:1 1 auto; min-height:0; overflow:hidden; }\n'+
  '    #editorOverlay.gameproject #editorWin #screen { width:auto; height:auto; max-width:100%; max-height:100%; }\n'+
  '    #editorOverlay.gameproject #console { flex:0 1 auto; min-height:48px; max-height:100px; }\n'+
  '    @media (max-width:979.98px) { #editorOverlay.gameproject .ed-body { flex:1 1 auto; overflow:auto; } }\n'+
  '    @media (max-width:979.98px) { #editorOverlay.gameproject .ed-pane:first-child { flex:1 0 240px; } }\n'+
  '    @media (max-width:979.98px) { #editorOverlay.gameproject .ed-pane:last-child { flex:1 0 480px; } }\n'+
  '    #gameDraft { font-size:11px; padding:4px; color:var(--blue); }\n'+
  '    #gameFile { max-width:100% !important; width:100% !important; }\n'+
  '    #gameWinBar { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-bottom:8px; }\n'+
  '    #gameWinBar button { width:auto; }\n'+
  '    #gameWinStatus { font-size:12px; max-width:640px; }\n'+
  '    .gamewin-screen { background:#000; display:flex; justify-content:center; align-items:center; padding:4px; }\n'+
  '    #gameWin { display:flex; flex-direction:column; width:min(1040px,94vw); height:min(88vh,850px); margin:0; padding:8px; }\n'+
  '    #gameWinSlot { flex:1 1 auto; min-height:0; }\n'+
  '    #gameWinBar { flex:0 0 auto; }\n'+
  '    #gameWinBar button { display:inline-flex; align-items:center; gap:5px; }\n'+
  '    #gameWinStatus { flex:1 1 240px; overflow-wrap:anywhere; }\n'+
  '    .ed-screenwrap, #gameWinSlot { container-type:size; }\n'+
  '    #editorWin #screen, #editorOverlay.gameproject #editorWin #screen, #gameWinOverlay #screen {\n'+
  '      display:block; width:min(100cqw,calc(100cqh * 4 / 3)); height:min(100cqh,calc(100cqw * 3 / 4));\n'+
  '      max-width:100%; max-height:100%; aspect-ratio:4/3; image-rendering:pixelated; background:#000;\n'+
  '    }\n'+
  '    #gameWin #console { flex:0 1 auto; max-width:100%; max-height:120px; overflow:auto; margin:8px 0 0; padding:6px; background:#000; color:var(--green); font-size:12px; white-space:pre-wrap; overflow-wrap:anywhere; }\n'+
  '    #gameWin #console:empty { display:none; }\n'+
  '    /* Stable containers keep fullscreen active when Run replaces the canvas. */\n'+
  '    #gameWin.view-fullscreen, #editorWin.view-fullscreen, #editorPreview.view-fullscreen {\n'+
  '      position:fixed !important; inset:0 !important; width:100vw !important; height:100dvh !important;\n'+
  '      max-width:none !important; max-height:none !important; margin:0 !important; transform:none !important;\n'+
  '      box-sizing:border-box; border:0; border-image:none; outline:0; padding:8px; background:#000;\n'+
  '      display:flex; flex-direction:column; min-height:0; z-index:2147483000;\n'+
  '    }\n'+
  '    #editorWin.view-fullscreen { background:#fff; }\n'+
  '    .view-fullscreen > .wbar, .view-fullscreen > .wvert, .view-fullscreen > .wcorn { display:none; }\n'+
  '    #gameWin.view-fullscreen #gameWinStatus { color:#fff; }\n'+
  '    #editorPreview.view-fullscreen .ed-screenwrap { flex:1 1 auto; min-height:0; }\n'+
  '    #editorPreview.view-fullscreen > .ed-h:not(.ed-screenhead), #editorPreview.view-fullscreen #console,\n'+
  '    #editorPreview.view-fullscreen #gamePreviewStatus { display:none; }\n'+
  '    @media (max-width:979.98px) { .ed-body { flex-direction:column; } }\n'+
  '    @media (max-width:979.98px) { #editorWin { height:94vh; } }\n'+
  '    @media (max-width:979.98px) { #editorWin #screen { height:min(100cqh,calc(100cqw * 3 / 4)); } }\n';
const HTML='  <div id="editorOverlay" class="overlay" role="dialog" aria-modal="true" aria-label="HolyC to WebAssembly editor">\n'+
  '    <div class="win" id="editorWin" data-title="HolyC → WebAssembly Editor">\n'+
  '      <span class="close" id="editorClose" title="Close editor">[X]</span>\n'+
  '      <div class="ed-bar">\n'+
  '        <button id="gameBack" title="Back to the games list">← Games</button>\n'+
  '        <button id="gameRun" title="Run the latest edits in the preview">' + Icon('play') + ' Run</button>\n'+
  '        <button id="gameStop" title="Stop the game preview" disabled>' + Icon('stop') + ' Stop</button>\n'+
  '        <button id="gameToDisk" title="Install this project\'s edited source and run it in TempleOS">▤ Run in TempleOS</button>\n'+
  '        <span id="gameTitle"></span>\n'+
  '        <select id="demoSelect" title="Pick a TempleOS HolyC demo or game"><option value="">- pick a demo / game -</option></select>\n'+
  '        <button id="edNew" title="Start a new HolyC program">New program</button>\n'+
  '        <button id="runBtn">' + Icon('play') + ' Run</button>\n'+
  '        <button id="editorFullscreen" type="button" title="Show the editor fullscreen" aria-pressed="false"><span aria-hidden="true">⛶</span> <span>Fullscreen editor</span></button>\n'+
  '        <button id="edFmt" title="Lay the code out the way Terry\'s own tools did (HolyC-fmt, a formatter written in HolyC, run in your browser)">⊹ Format</button>\n'+
  '        <button id="edSave" title="Download the source as a .HC file">'+Icon('download')+' Download</button>\n'+
  '        <button id="edFiles" title="Browse files on the TempleOS C: drive">' + Icon('folder') + ' Files</button>\n'+
  '        <button id="edOpen" title="Open a .HC file from your computer">'+Icon('upload')+' Import</button>\n'+
  '        <button id="edToDisk" title="Save this file to the TempleOS C: drive">Save to C:</button>\n'+
  '        <button id="gameRestore" title="Restore the original source for the selected file">↻ Restore file</button>\n'+
  '        <span id="status">ready</span>\n'+
  '      </div>\n'+
  '      <div class="ed-body">\n'+
  '        <section class="ed-pane">\n'+
  '          <div class="ed-h">HolyC source <span id="draftStatus" role="status"></span></div>\n'+
  '          <select id="gameFile" aria-label="Game source file"></select>\n'+
  '          <span id="gameDraft" role="status"></span>\n'+
  '          <div class="ed-editwrap"><pre id="editorHL" aria-hidden="true"></pre><textarea id="editor" spellcheck="false" autocomplete="off" autocapitalize="off" wrap="off"></textarea></div>\n'+
  '        </section>\n'+
  '        <section class="ed-pane" id="editorPreview">\n'+
  '          <div class="ed-h ed-screenhead"><span>Screen - 640×480, 16-color</span><div class="preview-actions"><button id="gameCapture" type="button" disabled aria-pressed="false" title="Capture the mouse in this preview; Esc returns to hybrid mode"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true"><path d="M6 1h4v1h2v2h1v8h-1v2h-2v1H6v-1H4v-2H3V4h1V2h2ZM8 1v5M3 6h10"/></svg><span>Capture mouse</span></button><button id="previewFullscreen" type="button" title="Show the game preview fullscreen" aria-pressed="false"><span aria-hidden="true">⛶</span> <span>Fullscreen game</span></button></div></div>\n'+
  '          <div id="gamePreviewStatus" role="status"></div>\n'+
  '          <div class="ed-screenwrap"><canvas id="screen" width="640" height="480" tabindex="0"></canvas></div>\n'+
  '          <div class="ed-h">Console</div>\n'+
  '          <pre id="console"></pre>\n'+
  '        </section>\n'+
  '      </div>\n'+
  '      <div class="ed-foot"><span id="editorRuntimeInfo">Click the screen to enable sound &amp; send keyboard/mouse to the program. Compiled with holyc-wasm - no emulation.</span> · <a href="Apps/Editor/Format.html" target="_blank" rel="noopener">Formatter page ↗</a></div>\n'+
  '    </div>\n'+
  '  </div>\n'+
  '  <div id="gameWinOverlay" class="overlay" role="dialog" aria-modal="true" aria-label="Game">\n'+
  '    <div class="win" id="gameWin" data-title="Game">\n'+
  '      <span class="close" id="gameWinClose" title="Close">[X]</span>\n'+
  '      <div id="gameWinBar"><button id="gameWinRun" type="button">Run</button><button id="gameWinEdit">Edit source</button><button id="gameWinCapture" type="button" disabled aria-pressed="false" title="Capture the mouse in this game; Esc returns to hybrid mode"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true"><path d="M6 1h4v1h2v2h1v8h-1v2h-2v1H6v-1H4v-2H3V4h1V2h2ZM8 1v5M3 6h10"/></svg><span>Capture mouse</span></button><button id="gameFullscreen" type="button" title="Show this game fullscreen" aria-pressed="false"><span aria-hidden="true">⛶</span> <span>Fullscreen</span></button><span id="gameWinStatus" role="status"></span></div>\n'+
  '      <div class="gamewin-screen" id="gameWinSlot"></div>\n'+
  '    </div>\n'+
  '  </div>\n';
WinAdd(CSS,HTML);

export const ed_game = { leave: null, stop: null, prepare: null, cancel: null, file: null };   // GamesWin.js fills these
export const ed_view = setupGameViews({ release: () => os_game.ed?.releaseMouse(), raise: WinRaise });

const ov = WinFind("editorOverlay");
const closeBtn = WinFind("editorClose");
// shared, memoized loader for the HolyC runtime (Apps/Editor/App.js) - used by the editor AND
// the Games launcher (which drives the same compile+worker+canvas+input machinery).
let appPromise=null,draft=null,draft_loading=false,save_directory="C:/Home/";
const STARTER='U0 MyProgram()\n{\n  "Hello, TempleOS!\\n";\n}\n\nMyProgram;\n';
const loadEditorApp = () => {
  if (!appPromise) appPromise = import("./App.js")
    .then(() => {
      os_game.ed=window.__holycEditor;
      try {
	draft=JSON.parse(sessionStorage.getItem("templeos.editor") ||
	  localStorage.getItem("templeos.editor"));
      } catch (error) {draft=null;}
      DraftRestore();
    })
    .catch((e) => { appPromise = null; const s = WinFind("status"); if (s) s.textContent = "editor failed to load: " + e.message; console.error("HolyC editor load failed", e); throw e; });
  return appPromise;
};
function open() {
  ed_game.prepare?.();
  ov.classList.add("open");
  ov.classList.remove("gamemode");
  WinRaise(ov);
  loadEditorApp().catch(console.error);
}
function close() {
  ed_view.exitWithin(WinFind('editorWin'));
  ed_game.cancel?.();
  ed_game.stop?.();
  ov.classList.remove("open", "free", "gamemode");
  if (os_game.ed) os_game.ed.stop();
}
closeBtn.addEventListener("click", close);
ov.addEventListener("mousedown", (e) => { if (e.target === ov) close(); });
WinFind("gameBack").addEventListener("click", () => {
  ed_view.exitWithin(WinFind('editorWin'));
  ed_game.cancel?.();
  ed_game.stop?.();
  if (os_game.ed) os_game.ed.stop();
  ov.classList.remove("open", "free", "gamemode");
  WinFind("gamesOverlay").classList.add("open");
});

function DraftRestore()
{
  let bytes;
  draft_loading=true;
  try {
    if (draft && typeof draft.bytes=="string") {
      bytes=Uint8Array.from(atob(draft.bytes),function Byte(ch) {
	return ch.charCodeAt(0);
      });
      save_directory=draft.directory || "C:/Home/";
      os_game.ed.FileLoad(bytes,draft.name || "MyProgram.HC",false,draft.path || null);
      if (typeof draft.text=="string") {
	ta.value=draft.text;
	ta.dispatchEvent(new Event("input"));
      }
      WinFind("draftStatus").textContent="— draft restored";
    } else
      os_game.ed.FileLoad(new TextEncoder().encode(STARTER),"MyProgram.HC");
  } catch (error) {
    os_game.ed.FileLoad(new TextEncoder().encode(STARTER),"MyProgram.HC");
    WinFind("draftStatus").textContent="— could not restore draft";
  } finally {
    draft_loading=false;
  }
}

function DraftSave()
{
  let bytes,text="",i;
  if (!os_game.ed || ed_game.file || draft_loading)
    return;
  try {
    bytes=new Uint8Array(os_game.ed.FileBytes());
    for (i=0;i<bytes.length;i+=8192)
      text+=String.fromCharCode(...bytes.subarray(i,i+8192));
    draft={name:os_game.ed.FileName(),bytes:btoa(text),path:os_game.ed.file.path,directory:save_directory};
  } catch (error) {
    if (!draft)
      draft={name:"MyProgram.HC",bytes:btoa(STARTER)};
    draft.text=ta.value;
  }
  try {
    sessionStorage.setItem("templeos.editor",JSON.stringify(draft));
    localStorage.setItem("templeos.editor",JSON.stringify(draft));
    WinFind("draftStatus").textContent="— draft saved";
  } catch (error) {
    WinFind("draftStatus").textContent="— draft could not be saved; download a copy";
  }
}

export async function EdNew(directory="C:/Home/")
{
  open();
  await loadEditorApp();
  ed_game.leave?.();
  ov.classList.remove("gamemode","gameproject");
  os_game.ed.stop();
  save_directory=directory;
  WinFind("demoSelect").value="";
  os_game.ed.FileLoad(new TextEncoder().encode(STARTER),"MyProgram.HC");
  ta.focus();
  setStatus("New program. Save to "+directory+" when ready.");
}

export async function EdFileOpen(bytes,path)
{
  open();
  await loadEditorApp();
  ed_game.leave?.();
  ov.classList.remove("gamemode","gameproject");
  os_game.ed.stop();
  save_directory=path.slice(0,path.lastIndexOf("/")+1);
  WinFind("demoSelect").value="";
  os_game.ed.FileLoad(bytes,path.split("/").pop(),false,path);
  ta.focus();
  setStatus(path);
}
WinFind("edNew").addEventListener("click",()=>EdNew().catch(error=>setStatus(error.message)));
WinFind("edFiles").addEventListener("click",async function () {
  try {
    const path=os_game.ed?.file.path,folder=path?path.slice(0,path.lastIndexOf("/")+1):save_directory;
    await (await import("../Files/FilesWin.js")).Open(folder);
  } catch (error) {setStatus(error.message);}
});


const ta = WinFind("editor");
ta.addEventListener("input",DraftSave);
addEventListener("pagehide",DraftSave);
const setStatus = (s) => { const st = WinFind("status"); if (st) st.textContent = s; };
const curName=()=>ed_game.file?ed_game.file.filename():os_game.ed?.FileName()||"MyProgram.HC";
WinFind("edSave").addEventListener("click", async () => {
  const name=curName();
  let source; try{source=ed_game.file?await ed_game.file.bytes():os_game.ed.FileBytes();}
  catch(e){setStatus(e.message);return;}
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([source], { type: "application/octet-stream" }));
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); setStatus("saved " + a.download);
});
WinFind("edOpen").addEventListener("click", () => {
  const i = document.createElement("input"); i.type = "file"; i.accept = ".HC,.hc,.txt,text/plain";
  i.onchange=async()=>{
    const file=i.files[0];
    if (!file) return;
    try {
      const bytes=await file.arrayBuffer();
      await loadEditorApp();
      ed_game.leave?.();
      WinFind("demoSelect").value="";
      os_game.ed.FileLoad(bytes,file.name);
      setStatus("opened "+file.name);
    } catch (error) {setStatus(error.message);}
  };
  i.click();
});
WinFind("edToDisk").addEventListener("click",async function () {
  const file=os_game.ed?.file,path=file?.path || prompt("Save to TempleOS:",save_directory+curName());
  if (!path) return;
  const button=WinFind("edToDisk");
  button.disabled=true;
  try {
    if (!path.startsWith("C:/") || path.slice(3).split("/").some(name=>!name || name=="." || name==".." ||
      name.length>37 || /[\x00-\x1F\\:\u0100-\uFFFF]/.test(name)))
      throw new Error("Use a C:/ folder and file name, with at most 37 characters per name.");
    const bytes=os_game.ed.FileBytes();
    setStatus("Saving "+path+"…");
    const result=await OsFileWrite(path,bytes);
    if (!result.ok) throw new Error(result.msg);
    file.path=path;file.name=path.split("/").pop();
    if (os_game.ed.file==file) DraftSave();
    setStatus("Saved "+path);
    dispatchEvent(new CustomEvent("osfilewrite",{detail:{path}}));
  } catch (error) {setStatus(error.message);}
  finally {button.disabled=false;}
});
// Format: reformat the editor source with holyc-fmt (the HolyC formatter, run in-browser)
const fmtBtn = WinFind("edFmt");
fmtBtn.addEventListener("click", async () => {
  if (fmtBtn.disabled) return;
  const src = ta.value;
  if (!src.trim()) { setStatus("nothing to format"); return; }
  fmtBtn.disabled = true; setStatus("formatting…");
  try {
    const { formatHolyC } = await import("./HolyFmt.js");
    const out = await formatHolyC(src, { indent: 2, tabs: true });   // Terry's layout: 2 a level, S2T tabs
    if (ta.value !== src) setStatus("Source changed. Format again to use your latest edits.");
    else if (out !== src) { ta.value = out; ta.dispatchEvent(new Event("input")); setStatus("formatted ✓"); }
    else setStatus("already formatted ✓");
  } catch (e) { setStatus("format error: " + e.message); }
  finally { fmtBtn.disabled = false; }
});

// ---- lightweight HolyC syntax highlighter for the editor ----
(function () {
  const ta = WinFind("editor");
  const hl = WinFind("editorHL");
  const wrap = ta && ta.closest(".ed-editwrap");
  if (!ta || !hl || !wrap) return;
  const KW = new Set("if else while for do switch case default break continue return goto sizeof try catch throw class union public extern _extern import _import reg noreg interrupt haserrcode lastclass start end asm offset argpop noargpop".split(" "));
  const TY = new Set("U0 U8 U16 U32 U64 I8 I16 I32 I64 F64 Bool U8z CDC CTask CDoc CHashTable CFifoI64 CDate".split(" "));
  const CO = new Set("TRUE FALSE NULL ON OFF BLACK BLUE GREEN CYAN RED PURPLE BROWN LTGRAY DKGRAY LTBLUE LTGREEN LTCYAN LTRED LTPURPLE YELLOW WHITE GR_WIDTH GR_HEIGHT TRANSPARENT".split(" "));
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const RE = /(\/\*[\s\S]*?\*\/)|(\/\/[^\n]*)|("(?:\\.|[^"\\])*")|('(?:\\.|[^'\\])*')|(#[A-Za-z_]+)|(\b\d[\w.]*)|([A-Za-z_]\w*)|([\s\S])/g;
  function paint(code) {
    let out = "", m; RE.lastIndex = 0;
    while ((m = RE.exec(code))) {
      if (m[1] || m[2]) out += '<span class="tc">' + esc(m[1] || m[2]) + "</span>";
      else if (m[3] || m[4]) out += '<span class="ts">' + esc(m[3] || m[4]) + "</span>";
      else if (m[5]) out += '<span class="tp">' + esc(m[5]) + "</span>";
      else if (m[6]) out += '<span class="tn">' + esc(m[6]) + "</span>";
      else if (m[7]) { const w = m[7], c = KW.has(w) ? "tk" : TY.has(w) ? "tt" : CO.has(w) ? "tco" : ""; out += c ? '<span class="' + c + '">' + esc(w) + "</span>" : esc(w); }
      else out += esc(m[8]);
    }
    return out;
  }
  let raf = 0;
  function update() {
    raf = 0;
    const v = ta.value;
    if (v.length > 40000) { wrap.classList.add("plain"); hl.textContent = ""; return; }
    wrap.classList.remove("plain");
    hl.innerHTML = paint(v) + "\n";
    hl.scrollTop = ta.scrollTop; hl.scrollLeft = ta.scrollLeft;
  }
  ta.addEventListener("input", () => { if (!raf) raf = requestAnimationFrame(update); });
  ta.addEventListener("scroll", () => { hl.scrollTop = ta.scrollTop; hl.scrollLeft = ta.scrollLeft; });
  update();
})();

export {open as Open,loadEditorApp as EdLoad,DraftRestore as EdDraftRestore};
