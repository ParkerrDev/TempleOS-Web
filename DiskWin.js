//Disk & Save: export and import the RAM snapshot and the C: disk, put a
//file in C:/Home, and list it. An import is kept in IndexedDB across the
//reload that boots it (Os.js).
import {WinAdd,WinRaise} from "./WinMgr.js";
import {$,dbg,engine,idb,os_disk} from "./Os.js";

const CSS='    /* Disk & Save window */\n'+
  '    #diskWin { display:flex; flex-direction:column; width:min(560px,94vw); max-height:88vh; margin:0; padding:10px; }\n'+
  '    .disk-body { overflow:auto; }\n'+
  '    .disk-sec { border-top:2px solid var(--blue); padding:8px 2px; }\n'+
  '    .disk-sec:first-child { border-top:0; }\n'+
  '    .disk-sec h3 { color:var(--red); font-size:12px; font-weight:normal; margin-bottom:3px; }\n'+
  '    .disk-sec p { color:var(--blue); font-size:12px; line-height:1.0; margin-bottom:6px; }\n'+
  '    .disk-sec kbd { background:var(--blue); color:#fff; padding:0 4px; }\n'+
  '    .disk-row { display:flex; gap:8px; flex-wrap:wrap; }\n'+
  '    .disk-row button { width:auto; }\n'+
  '    #homeList { list-style:none; margin:6px 0 0; padding:0; max-height:120px; overflow:auto; color:var(--blue); font-size:12px; }\n'+
  '    #homeList li { padding:1px 2px; }\n'+
  '    #diskStatus { color:var(--red); font-size:12px; min-height:1.4em; padding:6px 2px 0; }\n';
const HTML='  <div id="diskOverlay" class="overlay" role="dialog" aria-modal="true" aria-label="Disk and Save">\n'+
  '    <div class="win" id="diskWin" data-title="Disk &amp; Save">\n'+
  '      <span class="close" id="diskClose" title="Close">[X]</span>\n'+
  '      <div class="disk-body">\n'+
  '        <div class="disk-sec">\n'+
  '          <h3>Save your progress</h3>\n'+
  '          <p>A <b>snapshot</b> captures the entire running OS (memory + state) - reload it later to resume exactly where you left off. A <b>disk image</b> is your whole C: drive, including files you saved in TempleOS.</p>\n'+
  '          <div class="disk-row">\n'+
  '            <button id="dlSnap">↑ Export snapshot</button>\n'+
  '            <button id="dlDisk">↑ Export C: disk</button>\n'+
  '          </div>\n'+
  '        </div>\n'+
  '        <div class="disk-sec">\n'+
  '          <h3>Load / import</h3>\n'+
  '          <p>Boot from a snapshot you exported before, or mount a custom / previously-saved C: disk image (raw or qcow2, optionally gzipped). Importing reloads the page.</p>\n'+
  '          <div class="disk-row">\n'+
  '            <button id="ulSnap">↓ Import snapshot</button>\n'+
  '            <button id="ulDisk">↓ Import C: disk</button>\n'+
  '          </div>\n'+
  '        </div>\n'+
  '        <div class="disk-sec">\n'+
  '          <h3>Upload a file to C:/Home</h3>\n'+
  '          <p>Drop a <b>.HC</b> program/game (or any file) straight into TempleOS\'s <kbd>/Home</kbd>. Run it in the OS with <kbd>#include "Name"</kbd> or by clicking it in a <kbd>Dir</kbd> listing.</p>\n'+
  '          <div class="disk-row">\n'+
  '            <button id="ulFile">↥ Choose file…</button>\n'+
  '            <button id="lsHome">↻ List /Home</button>\n'+
  '          </div>\n'+
  '          <ul id="homeList"></ul>\n'+
  '        </div>\n'+
  '        <div id="diskStatus"></div>\n'+
  '      </div>\n'+
  '    </div>\n'+
  '  </div>\n';
WinAdd(CSS,HTML);

const ov = $("diskOverlay"), st = $("diskStatus");
const say = (s) => { st.textContent = s; dbg("disk: " + s); };
const dl = (bytes, name, type) => { const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([bytes], { type: type || "application/octet-stream" }));
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
const pickFile = (accept) => new Promise((res) => { const i = document.createElement("input"); i.type = "file"; if (accept) i.accept = accept;
  i.onchange = () => res(i.files[0] || null); i.click(); });
const maybeGunzip = async (buf) => { const u = new Uint8Array(buf);
  if (u[0] === 0x1f && u[1] === 0x8b) return new Uint8Array(await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
  return u; };

os_disk.msg = (m) => {
  if (m.cmd === "exportResult") {
    if (!m.ok) { say("export failed: " + m.msg); return; }
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
    if (m.kind === "snapshot") dl(m.buf, `templeos-${stamp}.hemu.gz`), say("snapshot exported");
    else dl(m.buf, `templeos-C-${stamp}.img.gz`, "application/gzip"), say("C: disk exported");
  }
  else if (m.cmd === "guestResult" && ["failed","error"].includes(m.state) && m.op === "launch") say("Launch failed: "+m.msg);
  else if (m.cmd === "fileResult") say(m.ok ? "✓ " + m.msg : "✗ " + m.msg);
  else if (m.cmd === "diskInfo") say(m.ok ? "✓ " + m.msg : "✗ " + m.msg);
  else if (m.cmd === "dirList") {
    const ul = $("homeList"); ul.innerHTML = "";
    if (!m.ok) { say("list failed: " + m.msg); return; }
    for (const f of m.files) { const li = document.createElement("li"); li.textContent = (f.dir ? "[D] " : "    ") + f.name + (f.dir ? "" : "  " + f.size + "b"); ul.appendChild(li); }
    say(m.files.length + " entries in /" + (m.dir || "Home"));
  }
};


$("dlSnap").addEventListener("click", () => { say("compressing 384 MB… (a few seconds)"); engine.post({ cmd: "exportSnapshot" }); });
$("dlDisk").addEventListener("click", () => { say("reading + compressing C:…"); engine.post({ cmd: "exportDisk" }); });
$("ulSnap").addEventListener("click", async () => {
  const f = await pickFile(".gz,.hemu,application/gzip"); if (!f) return;
  say("storing snapshot, reloading…");
  await idb.set("importSnap", await f.arrayBuffer());
  location.reload();
});
$("ulDisk").addEventListener("click", async () => {
  const f = await pickFile(".img,.raw,.qcow2,.gz"); if (!f) return;
  say("decompressing disk image…");
  const bytes = await maybeGunzip(await f.arrayBuffer());
  await idb.set("importDisk", bytes.buffer);
  say("stored, reloading…"); location.reload();
});
$("ulFile").addEventListener("click", async () => {
  const f = await pickFile(); if (!f) return;
  const name = f.name.length > 37 ? f.name.slice(0, 37) : f.name;
  const bytes = new Uint8Array(await f.arrayBuffer());
  say("writing " + name + " to C:/Home…");
  engine.post({ cmd: "osWrite", name, run: false, bytes: bytes.buffer }, [bytes.buffer]);   // OS-side FileWrite (no host cache poke)
});
$("lsHome").addEventListener("click", () => { say("reading /Home…"); engine.post({ cmd: "listDir", dir: "Home" }); });

const open = () => { ov.classList.add("open"); WinRaise(ov); st.textContent = engine.kind ? "" : "engine not ready yet"; };
const close = () => ov.classList.remove("open", "free");
$("diskClose").addEventListener("click", close);
ov.addEventListener("pointerdown", (e) => { if (e.target === ov) close(); });

export {open as Open};
