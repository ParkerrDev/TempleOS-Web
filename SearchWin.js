//Terry Search: a fuzzy search over every transcribed video. The shards are
//built by build-transcripts.mjs and transearch.js scores them in a worker.
//Each hit links to its video on archive.org at the hit's time, and any
//passage, the shown results or a whole transcript can be copied.
import {WinAdd,WinDress,WinFocus,WinRaise} from "./WinMgr.js";
import {$} from "./Os.js";
import {ArchiveFile,ArchiveWatch} from "./Archive.js";
import {ClipPanel} from "./clip/Panel.js";
const clip_style=document.createElement("link");
clip_style.rel="stylesheet";clip_style.href=new URL("./clip/Panel.css",import.meta.url);
document.head.append(clip_style);

const CSS='    /* Terry transcript search window */\n'+
  '    #tsWin { display:flex; flex-direction:column; gap:8px; width:min(860px,94vw); height:min(82vh,720px); margin:0; padding:10px; }\n'+
  '    #tsBar { display:flex; gap:8px; align-items:center; flex:0 0 auto; }\n'+
  '    #tsQwrap { position:relative; flex:1 1 auto; min-width:0; display:flex; }\n'+
  '    #tsQ { width:100%; min-width:0; height:var(--ctlh); font-family:\'TempleOS\',\'dos_vga\',monospace; font-size:12px; color:#000; background:#fff;\n'+
  '           border:2px solid #fff; outline:2px solid #000; padding:4px 36px 4px 8px; }\n'+
  '    #tsCopyAll { height:var(--ctlh); }\n'+
  '    #tsQ::-webkit-search-cancel-button { -webkit-appearance:none; appearance:none; display:none; }   /* the browser\'s emoji-ish ✕ */\n'+
  '    #tsClear { position:absolute; right:3px; top:50%; transform:translateY(-50%); width:auto; border:0; outline:0;\n'+
  '               background:transparent; color:var(--blue); font-family:inherit; font-size:12px; line-height:1; padding:3px 8px; }\n'+
  '    #tsClear:hover { color:#fff; background:var(--red); }\n'+
  '    #tsQ:placeholder-shown + #tsClear { display:none; }   /* only show when there\'s something to clear */\n'+
  '    #tsCtl { display:flex; gap:10px; align-items:center; flex:0 0 auto; flex-wrap:wrap; }\n'+
  '    .ts-seg { display:flex; }\n'+
  '    .ts-seg button { width:auto; height:var(--ctlh); font-size:12px; padding:2px 10px; background:#fff; color:var(--blue); border:2px solid var(--blue); }\n'+
  '    .ts-seg button + button { border-left:0; }\n'+
  '    .ts-seg button.on { background:var(--blue); color:#fff; }\n'+
  '    #tsCtl select { font-family:inherit; height:var(--ctlh); font-size:12px; color:#000; background:#fff; border:2px solid #fff; outline:2px solid #000; padding:2px 6px; }\n'+
  '    #tsYearWrap { position:relative; }\n'+
  '    #tsYearBtn { width:auto; height:var(--ctlh); font-size:12px; padding:2px 10px; }\n'+
  '    #tsYearPanel { display:none; position:absolute; left:0; top:calc(100% + 4px); z-index:6; background:#fff;\n'+
  '                   border:3px double var(--blue); padding:6px 12px; min-width:130px; max-height:280px; overflow:auto; }\n'+
  '    #tsYearPanel.open { display:block; }\n'+
  '    #tsYearPanel label { display:flex; gap:6px; align-items:center; color:var(--blue); font-size:12px; padding:1px 0; white-space:nowrap; cursor:inherit; }\n'+
  '    #tsYearPanel input { position:absolute; opacity:0; pointer-events:none; }   /* the [ ]/[X] text IS the checkbox (TempleOS style) */\n'+
  '    #tsYearPanel .cb::before { content:"[ ]"; white-space:pre; }\n'+
  '    #tsYearPanel input:checked + .cb::before { content:"[X]"; }\n'+
  '    #tsYearPanel button { width:100%; margin-top:5px; font-size:12px; padding:1px 6px; }\n'+
  '    .ts-sec { color:#fff; font-size:12px; padding:2px 2px 5px; }\n'+
  '    #tsMore { width:100%; margin-top:2px; }\n'+
  '    #tsStatus { flex:0 0 auto; color:var(--blue); font-size:12px; padding:0 2px; min-height:1.3em; }\n'+
  '    #tsOut { flex:1 1 auto; min-height:0; overflow:auto; background:var(--blue); padding:6px; }\n'+
  '    #tsWin button { width:auto; font-size:12px; padding:2px 8px; }\n'+
  '    .ts-hit { display:block; background:#fff; margin:0 0 6px; padding:5px 8px; border:2px solid #fff; }\n'+
  '    .ts-hit:hover { border-color:var(--yellow); }\n'+
  '    .ts-row { display:flex; flex-wrap:wrap; align-items:baseline; gap:8px; }\n'+
  '    .ts-t { flex:1 1 180px; color:var(--red); font-weight:bold; font-size:12px; text-decoration:none; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }\n'+
  '    .ts-t:hover { text-decoration:underline; }\n'+
  '    .ts-m { color:var(--blue); font-size:12px; white-space:nowrap; }\n'+
  '    .ts-act { margin-left:auto; display:flex; gap:4px; flex:0 0 auto; }\n'+
  '    .ts-act button { padding:0 6px; line-height:1.0; }\n'+
  '    .ts-x { display:block; color:#000; font-size:12px; line-height:1.0; margin-top:2px; word-break:break-word; text-decoration:none; }\n'+
  '    .ts-x b { color:#fff; background:var(--red); font-weight:normal; padding:0 1px; }\n'+
  '    .ts-none { color:#fff; font-size:12px; padding:8px; }\n'+
  '    .ts-trh { display:flex; gap:6px; align-items:center; flex-wrap:wrap; position:sticky; top:-6px; background:var(--blue); padding:6px 0; z-index:1; }\n'+
  '    .ts-trh a { color:var(--yellow); font-size:12px; }\n'+
  '    .ts-line { background:#fff; color:#000; font-size:12px; line-height:1.0; padding:2px 8px; word-break:break-word; }\n'+
  '    .ts-line .ts-ts { color:var(--red); text-decoration:underline; margin-right:6px; }\n'+
  '    .ts-line .ts-ts:hover { color:#fff; background:var(--red); }\n'+
  '    /* floating video windows (▶ in Terry Search): real TempleOS chrome via dress(); many at once */\n'+
  '    .vidwin { padding:6px; }\n'+
  '    .vidwin video { display:block; width:100%; max-height:62vh; background:#000; }\n'+
  '    .vidwin .ts-verr { background:#000; }\n'+
  '    .ts-verr { color:#fff; padding:12px; font-size:12px; line-height:1.0; }\n'+
  '    .ts-verr a { color:var(--yellow); }\n'+
  '    .ts-verr button, .ts-convbar button { width:auto; font-size:12px; padding:2px 10px; }\n'+
  '    .ts-convst { color:var(--yellow); min-height:1.3em; margin-top:8px; }\n'+
  '    .ts-convdone video { display:block; width:100%; max-height:62vh; background:#000; }\n'+
  '    .ts-convbar { display:flex; gap:10px; align-items:center; background:#000; color:#fff; font-size:12px; padding:4px 8px; }\n'+
  '    .ts-convbar span:last-child { color:var(--yellow); }\n'+
  '    /* [?] hover help: attribution + the operator cheatsheet, only when you ask for it */\n'+
  '    #tsHelp { margin-left:auto; position:relative; color:var(--blue); font-size:12px; padding:2px 4px; user-select:none; }\n'+
  '    #tsHelpPop { display:none; position:absolute; right:0; top:calc(100% + 4px); z-index:7; width:min(430px, 80vw);\n'+
  '                 background:#fff; border:3px double var(--blue); color:var(--blue); font-size:12px; line-height:1.0; padding:8px 12px; }\n'+
  '    #tsHelp:hover #tsHelpPop, #tsHelp.open #tsHelpPop { display:block; }\n';
const HTML='  <div id="tsOverlay" class="overlay" role="dialog" aria-modal="true" aria-label="Terry A. Davis transcript search">\n'+
  '    <div class="win" id="tsWin" data-title="Terry Search · every word he said on video">\n'+
  '      <span class="close" id="tsClose" title="Close">[X]</span>\n'+
  '      <div id="tsBar"><span id="tsQwrap"><input id="tsQ" type="search" placeholder="search Terry\'s transcripts… (typos OK)"\n'+
  '        title="Google-style: &quot;exact phrase&quot; · -exclude · terry OR dave · date:2012-2014 · in:titles · since:/until:"\n'+
  '        autocomplete="off" autocapitalize="off" spellcheck="false" /><button id="tsClear" title="clear the search">X</button></span>\n'+
  '        <button id="tsCopyAll" title="Copy all shown results (quote + video + timestamp + link)">⧉ Copy results</button></div>\n'+
  '      <div id="tsCtl">\n'+
  '        <span class="ts-seg" title="what to search">\n'+
  '          <button data-sc="all" class="on">All</button><button data-sc="title">Titles</button><button data-sc="text">Transcript</button>\n'+
  '        </span>\n'+
  '        <select id="tsMode" title="result order">\n'+
  '          <option value="rel">best match</option>\n'+
  '          <option value="new">newest first</option>\n'+
  '          <option value="old">oldest first</option>\n'+
  '        </select>\n'+
  '        <span id="tsYearWrap"><button id="tsYearBtn" title="filter by year - picking years adds date: filters to your search">year ▾</button>\n'+
  '          <div id="tsYearPanel"></div></span>\n'+
  '        <span id="tsHelp">[?]\n'+
  '          <div id="tsHelpPop">Whisper transcripts of the <a href="https://archive.org/details/TerryADavis_TempleOS_Archive" target="_blank" rel="noopener">TerryADavis_TempleOS_Archive</a> - click any result to watch that video at that moment.<br><br>\n'+
  '          Google-style: "exact phrase" · -exclude · terry OR dave · date:2012-2014,2017 · in:titles · since:2017-06 until:2017-11-19</div>\n'+
  '        </span>\n'+
  '      </div>\n'+
  '      <div id="tsStatus">open to load transcripts…</div>\n'+
  '      <div id="tsOut"></div>\n'+
  '    </div>\n'+
  '  </div>\n';
WinAdd(CSS,HTML);

const ov = $("tsOverlay"), out = $("tsOut"), q = $("tsQ"), st = $("tsStatus");
let w = null, qid = 0, vid = 0, deb = null, lastHits = [], lastTerms = [], lastTotal = 0;
let sortBy="rel";
let lastVids = [], browseTotal = 0, lastMsg = null, lastView = null;
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const hms = (s) => { s = Math.max(0, s | 0); const h = (s / 3600) | 0, m = ((s % 3600) / 60) | 0, ss = s % 60;
  return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(ss).padStart(2, "0"); };
const url=(h,sec)=>ArchiveWatch(h,sec==null?null:Math.max(0,sec-2));
// ---- VIDEO WINDOWS: each ▶ opens the video in its own draggable TempleOS window (real
//      chrome via WinDress); any number can play at once. They stack in their own
//      z tier ABOVE the search overlay, persist after it closes, and [X] destroys them.
//      Streams the original from archive.org (no isolation on this site, so cross-origin
//      <video> just works; .mkv plays in Chromium-family; undecodable formats fall back). ----
const dl=(h,sec)=>ArchiveFile(h.f)+(sec?"#t="+Math.max(0,sec-2):"");
let vidN = 0;
const vidWins = new Set();
const openVideoWindow = (h, sec, play=true) => {
  const w = document.createElement("div");
  w.className = "win vidwin";
  w.dataset.title = `${h.t} · ${h.d}`;
  const x = document.createElement("span"); x.className = "close"; x.textContent = "[X]";
  const v = document.createElement("video");
  v.controls=true;v.autoplay=play;v.playsInline=true;v.preload=play?"metadata":"none";
  v.src = dl(h, sec);
  const t0 = Math.max(0, (sec || 0) - 2);
  v.addEventListener("loadedmetadata", () => { if (t0 && Math.abs(v.currentTime - t0) > 2) { try { v.currentTime = t0; } catch {} } });
  v.addEventListener("error", () => {
    const ext = (h.f.split(".").pop() || "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    const er = document.createElement("div"); er.className = "ts-verr";
    er.innerHTML = `this browser can't decode the .${ext} original (archive.org never web-encoded it).<br>` +
      `<button class="ts-conv">▶ Convert &amp; play here</button> - in-browser ffmpeg, nothing uploaded - ` +
      `or <a href="${dl(h)}" download>download</a> for VLC/mpv (moment: ${hms(sec || 0)}).` +
      `<div class="ts-convst"></div>`;
    v.replaceWith(er);
    const stl = er.querySelector(".ts-convst"), go = er.querySelector(".ts-conv");
    // convert a window from the searched moment and play it RIGHT IN THIS WINDOW
    const doConvert = async (startSec) => {
      const { convertVideo } = await import("./convert.js");
      const r = await convertVideo({ f: h.f, start: startSec, win: 600,
        onStatus: (m) => { stl.textContent = m; } });
      const nv = document.createElement("video");
      nv.controls = true; nv.autoplay = true; nv.playsInline = true; nv.src = r.blobUrl;
      const off = Math.max(0, (sec || 0) - r.start);
      nv.addEventListener("loadedmetadata", () => { if (off > 1 && off < (nv.duration || 1e9)) { try { nv.currentTime = off; } catch {} } }, { once: true });
      const box = document.createElement("div");
      box.appendChild(nv);
      if (r.windowed) {
        const bar = document.createElement("div"); bar.className = "ts-convbar";
        const lbl = document.createElement("span"); lbl.textContent = `converted ${hms(r.start)} to ${hms(r.start + r.win)}`;
        const nx = document.createElement("button"); nx.textContent = `⏭ next ${r.win >= 120 ? Math.round(r.win / 60) + " min" : r.win + " s"}`;
        const nst = document.createElement("span");
        nx.addEventListener("click", () => { nx.disabled = true;
          doConvert(r.start + r.win).catch((e) => { nst.textContent = "✗ " + e.message; nx.disabled = false; }); });
        bar.append(lbl, nx, nst); box.appendChild(bar);
      }
      const cur = w.querySelector("video, .ts-verr, .ts-convdone");
      box.className = "ts-convdone";
      if (cur && cur.parentNode) { const old = w.querySelector("video"); if (old && old.src.startsWith("blob:")) URL.revokeObjectURL(old.src); cur.replaceWith(box); }
      w._tsVideo = nv;                                   // transcript [h:mm:ss] seeking targets the new video
    };
    go.addEventListener("click", () => { go.disabled = true;
      doConvert(Math.max(0, (sec || 0) - 5)).catch((e) => { stl.textContent = "✗ " + e.message; go.disabled = false; }); });
  });
  const clip=ClipPanel(h,Math.max(0,(sec || 0)-2),(sec || 0)+20);
  w.append(x,v,clip.element);
  document.body.appendChild(w);
  const n = vidN++ % 7;                                  // cascade new windows
  w.dataset.floating = "1";
  w.style.position = "fixed";
  w.style.width = "min(560px, 92vw)";
  w.style.left = Math.max(8, innerWidth / 2 - 280 + n * 30) + "px";
  w.style.top = (84 + n * 28) + "px";
  w._tsF = h.f; w._tsVideo = v;
  vidWins.add(w);
  const destroy = () => { clip.Close(); const vv = w.querySelector("video") || v;
    try { vv.pause(); if (vv.src && vv.src.startsWith("blob:")) URL.revokeObjectURL(vv.src); vv.removeAttribute("src"); vv.load(); } catch {}
    w.remove(); vidWins.delete(w); };
  WinDress(w, { onClose: destroy });
  WinFocus(w);
  return w;
};
// a transcript [h:mm:ss] click seeks an open window of that same video (raising it)
const seekOpenWindow = (f, sec) => {
  for (const w of vidWins) if (w._tsF === f && w.isConnected) {
    const v = w._tsVideo; if (!v || !v.src) continue;
    v.currentTime = Math.max(0, sec - 2); v.play().catch(() => {});
    WinFocus(w);
    return true;
  }
  return false;
};
// highlight matched terms (longest first; sentinel chars so replacements can't corrupt the HTML)
const hi = (text, terms) => { let h = esc(text);
  for (const term of [...new Set(terms || [])].sort((a, b) => b.length - a.length).slice(0, 12)) {
    if (term.length < 2) continue;
    h = h.replace(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), (x) => "\u0001" + x + "\u0002"); }
  return h.replace(/\u0001/g, "<b>").replace(/\u0002/g, "</b>"); };
// clipboard with button feedback (navigator.clipboard needs https/localhost; textarea fallback otherwise)
const copy = async (text, btn) => {
  try { await navigator.clipboard.writeText(text); }
  catch { const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch {} ta.remove(); }
  if (btn) { const old = btn.textContent; btn.textContent = "✓ copied"; btn.disabled = true;
    setTimeout(() => { btn.textContent = old; btn.disabled = false; }, 900); } };
const hitText = (h) => `“${h.text}”\n- Terry A. Davis, ${h.t} (${h.d}), at ${hms(h.sec)}\n${url(h, h.sec)}`;
const vidText = (v) => `${v.t} (${v.d})${v.n ? " · " + hms(v.n) : ""} - Terry A. Davis\n${url(v)}`;
// a VIDEO card (browse mode + title matches): same chrome as a passage card, teaser instead of a quote
const vidCard = (v, j) =>
  `<div class="ts-hit ts-vidcard" data-v="${j}">` +
    `<div class="ts-row"><a class="ts-t" href="${url(v, 0)}" target="_blank" rel="noopener" title="${v.p ? "watch on archive.org" : "archive.org never web-encoded this original - opens our player page"}">${esc(v.t)}</a>` +
    `<span class="ts-m">${esc(v.d)}${v.n ? " · " + hms(v.n) : ""} · ${v.k} passages</span>` +
    `<span class="ts-act"><button class="ts-pl" data-v="${j}" title="play in a window">▶</button>` +
    `<button class="ts-clip" data-v="${j}" title="Export a video section">Clip</button>` +
    `<button class="ts-cp" data-v="${j}" title="copy title + link">⧉</button></span></div>` +
    (v.x ? `<span class="ts-x" title="click to expand the full transcript">${esc(v.x)}…</span>` : "") + `</div>`;
const renderBrowse = () => {
  lastHits = []; lastView = renderBrowse;
  out.innerHTML = lastVids.map((v, j) => vidCard(v, j)).join("") +
    (lastVids.length < browseTotal ? `<button id="tsMore">↓ more (${(browseTotal - lastVids.length).toLocaleString()} older videos)</button>` : "");
  const mb = $("tsMore"); if (mb) mb.addEventListener("click", () => { qid++; w.postMessage({ type: "browse", id: qid, sort: sortBy, offset: lastVids.length }); });
  st.textContent = `${browseTotal.toLocaleString()} videos · ${sortBy === "old" ? "oldest" : "newest"} first - type to search, ▶ plays, click a card for the transcript`;
};
const render = (m) => {
  if (m.note=="loading") return;
  lastHits = m.hits; lastTerms = m.terms || []; lastTotal = m.total || 0;
  lastVids = m.vids || []; lastMsg = m; lastView = () => render(lastMsg);
  let html = "";
  if (lastVids.length) {
    html += `<div class="ts-sec">${m.dateOnly
        ? `${m.vtotal} video${m.vtotal === 1 ? "" : "s"} in this date range${m.vtotal > lastVids.length ? ` · top ${lastVids.length}` : ""}`
        : `${m.vtotal === lastVids.length ? m.vtotal : `top ${lastVids.length} of ${m.vtotal}`} matching title${m.vtotal === 1 ? "" : "s"}`}</div>` +
      lastVids.map((v, j) => vidCard(v, j)).join("");
    if (m.hits.length) html += `<div class="ts-sec">matching passages</div>`;
  }
  html += m.hits.map((h, i) =>
    `<div class="ts-hit" data-i="${i}">` +
      `<div class="ts-row"><a class="ts-t" href="${url(h, h.sec)}" target="_blank" rel="noopener" title="${h.p ? `watch on archive.org at ${hms(h.sec)}` : `archive.org never web-encoded this original - plays in our mini-player at ${hms(h.sec)}`}">${esc(h.t)}</a>` +
      `<span class="ts-m">${esc(h.d)} · ▶ ${hms(h.sec)}${h.n ? " / " + hms(h.n) : ""}</span>` +
      `<span class="ts-act"><button class="ts-pl" data-i="${i}" title="play in a window, from ${hms(h.sec)}">▶</button>` +
      `<button class="ts-clip" data-i="${i}" title="Export this passage as a video clip">Clip</button>` +
      `<button class="ts-cp" data-i="${i}" title="copy this passage (with video + timestamp + link)">⧉</button></span></div>` +
      `<span class="ts-x" title="click to expand the full transcript">${hi(h.text, m.terms)}</span></div>`).join("");
  out.innerHTML = html ||
    (q.value.trim() ? `<div class="ts-none">no matches - typos are OK, but he may never have said it</div>` : "");
  const bits = [];
  if (m.dateOnly) bits.push(`${m.vtotal} video${m.vtotal === 1 ? "" : "s"} in range`);
  else { if (m.scope !== "title") bits.push(`${m.total} matching passages`);
         if (m.vtotal) bits.push(`${m.vtotal} matching title${m.vtotal === 1 ? "" : "s"}`); }
  if (m.hits.length || lastVids.length) st.textContent = bits.join(" · ") + " - ▶ plays in a window, ⧉ copies, click a card for the full transcript";
};
// full-transcript view for one video: back / copy-all / download .txt / watch, then every passage
const transcriptText = (v) => `${v.t} (${v.d}) - Terry A. Davis\n${url(v)}\n\n` +
  v.s.map(([sec, text]) => `[${hms(sec)}] ${text}`).join("\n");
let curTrF = null;                                     // file path shown in the transcript view (timestamp clicks seek its window)
const renderTranscript = (v) => {
  curTrF = v.f;
  st.textContent = `${v.t} - full transcript, ${v.s.length} passages${v.n ? ", " + hms(v.n) : ""}`;
  out.innerHTML = `<div class="ts-trh"><button id="tsBack">← results</button>` +
    `<button id="tsPlHere" title="play this video in a window - the [h:mm:ss] timestamps below seek it">▶ Play</button>` +
    `<button id="tsCpTr">⧉ Copy transcript</button><button id="tsDlTr">↓ .txt</button>` +
    `<a href="${url(v, 0)}" target="_blank" rel="noopener">${v.p ? "watch on archive.org" : "open in the mini-player"}</a></div>` +
    v.s.map(([sec, text]) => `<div class="ts-line"><button class="ts-clip-line" data-s="${sec}" title="Export a clip from this timestamp">Clip</button> <a class="ts-ts" data-s="${sec}" href="${url(v, sec)}" target="_blank" rel="noopener">[${hms(sec)}]</a>${esc(text)}</div>`).join("");
  out.scrollTop = 0;
  for (const button of out.querySelectorAll(".ts-clip-line"))
    button.addEventListener("click",function () {
      openVideoWindow(v,Number(button.dataset.s),false);
    });
  $("tsPlHere").addEventListener("click", () => {
    if (!seekOpenWindow(v.f, v.s[0] ? v.s[0][0] : 0)) openVideoWindow(v, v.s[0] ? v.s[0][0] : 0); });
  $("tsBack").addEventListener("click", () => { curTrF = null; if (lastView) lastView(); });
  $("tsCpTr").addEventListener("click", (e) => copy(transcriptText(v), e.target));
  $("tsDlTr").addEventListener("click", () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([transcriptText(v)], { type: "text/plain" }));
    a.download = (`${v.d} - ${v.t}`).replace(/[\\/:*?"<>|]/g, "_").slice(0, 120) + ".txt";
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); });
};
const expand = (h) => { if (h && w) { vid++; w.postMessage({ type: "video", f: h.f, id: vid }); } };
const refOf = (el) => el.dataset.v !== undefined ? lastVids[+el.dataset.v] : lastHits[+el.dataset.i];   // video card or passage hit
out.addEventListener("click", (e) => {
  const clip=e.target.closest(".ts-clip");
  if (clip) {
    const hit=refOf(clip);
    if (hit) {
      const win=openVideoWindow(hit,hit.sec || 0,false);
      win.querySelector(".clip-panel input").focus();
    }
    return;
  }
  const pl = e.target.closest(".ts-pl");
  if (pl) { const h = refOf(pl); if (h) openVideoWindow(h, h.sec || 0); return; }
  const cp = e.target.closest(".ts-cp");
  if (cp) { const h = refOf(cp); if (h) copy(h.sec !== undefined ? hitText(h) : vidText(h), cp); return; }
  const ts = e.target.closest(".ts-ts");
  if (ts) {                                            // transcript timestamps SEEK an open window of this video
    if (seekOpenWindow(curTrF, +ts.dataset.s)) e.preventDefault();
    return; }
  if (e.target.closest("a, button")) return;           // the red title link (and any other control) keeps its own behavior
  const card = e.target.closest(".ts-hit");
  if (card) expand(refOf(card)); });                   // clicking the card expands the full transcript
$("tsCopyAll").addEventListener("click", (e) => {
  const qq = q.value.trim();
  if (lastHits.length) copy(`Terry Search: "${qq}" - top ${lastHits.length} of ${lastTotal} matching passages\n\n` +
    lastHits.map(hitText).join("\n\n"), e.target);
  else if (lastVids.length) copy((qq ? `Terry Search: "${qq}" - ${lastVids.length} videos\n\n`
    : `Terry A. Davis archive - ${lastVids.length} of ${browseTotal} videos\n\n`) + lastVids.map(vidText).join("\n"), e.target); });
const ask = () => { if (!w) return; qid++;
  const qq = q.value.trim();
  if (!qq) w.postMessage({ type: "browse", id: qid, sort: sortBy, offset: 0 });
  else w.postMessage({ type: "query", q: qq, id: qid, sort: sortBy }); };   // everything else rides IN the query (Google-style operators)
let parse_id=0,edit_id=0,pending_edit=null,edit_queue=Promise.resolve();
const syncFromQuery=()=>{
  if (w) w.postMessage({type:"parse",q:q.value,id:++parse_id});
};
const showControls=(parsed)=>{
  for (const button of document.querySelectorAll(".ts-seg button"))
    button.classList.toggle("on",button.dataset.sc==parsed.scope);
  const years=new Set(parsed.years);
  for (const checkbox of $("tsYearPanel").querySelectorAll("input"))
    checkbox.checked=years.has(checkbox.value);
  $("tsYearBtn").textContent=(years.size?`year (${years.size})`:"year")+" ▾";
};
const editQuery=(change)=>{
  edit_queue=edit_queue.then(()=>new Promise((resolve,reject)=>{
    if (!w) init();
    pending_edit={id:++edit_id,resolve,reject};
    w.postMessage({type:"edit",id:edit_id,q:q.value,change});
  })).then(result=>{
    if (q.value==result.text) {
      q.value=result.value.trim();
      ask();
    }
    syncFromQuery();
  }).catch(error=>{
    st.textContent=error.message;
    syncFromQuery();
  });
};
for (const button of document.querySelectorAll(".ts-seg button"))
  button.addEventListener("click",()=>editQuery({scope:button.dataset.sc}));
$("tsMode").addEventListener("change", () => { sortBy = $("tsMode").value; ask(); });
let yearFill = null;
{ const btn = $("tsYearBtn"), panel = $("tsYearPanel");
  yearFill = (ys) => {
    panel.innerHTML = "";
    for (const y of ys) {
      const l = document.createElement("label"), c = document.createElement("input"), cb = document.createElement("span");
      c.type = "checkbox"; c.value = y; cb.className = "cb";
      c.addEventListener("change",()=>editQuery({year:y,selected:c.checked}));
      l.append(c, cb, document.createTextNode(y)); panel.appendChild(l);
    }
    const any = document.createElement("button"); any.textContent = "any year";
    any.addEventListener("click",()=>editQuery({year:null}));
    panel.appendChild(any);
  };
  btn.addEventListener("click", () => panel.classList.toggle("open"));
  document.addEventListener("pointerdown", (e) => { if (!e.target.closest("#tsYearWrap")) panel.classList.remove("open"); });
}
const init = () => { if (w) return;
  w = new Worker("./transearch.js",{type:"module"});
  st.textContent = "loading transcripts…";
  w.onmessage = (e) => { const m = e.data;
    if (m.type === "progress") st.textContent = `loading transcripts… ${m.loaded}/${m.total} shards · ${m.videos} videos`;
    else if (m.type === "ready") { st.textContent = `${m.videos.toLocaleString()} videos · ${m.chunks.toLocaleString()} passages · ${m.words.toLocaleString()} distinct words - type to search`;
      if (m.years) yearFill(m.years);
      syncFromQuery();ask(); }                                         // empty query -> browse: the LATEST videos show by default
    else if (m.type=="parsed" && m.id==parse_id && m.text==q.value) showControls(m.parsed);
    else if (m.type=="edited" && pending_edit?.id==m.id) {
      const reply=pending_edit;pending_edit=null;reply.resolve(m);
    } else if (m.type=="error") {
      if (m.phase=="edit" && pending_edit?.id==m.id) {
        const reply=pending_edit;pending_edit=null;reply.reject(new Error(m.message));
      } else if (m.phase=="load") {
        st.textContent="Could not load transcripts: "+m.message+" ";
        const retry=document.createElement("button");retry.textContent="Retry";
        retry.addEventListener("click",()=>{
          st.textContent="loading transcripts…";
          w.postMessage({type:"load",base:"./assets/transcripts/"});
        });
        st.append(retry);
      } else if (m.phase=="parse" && m.id==parse_id || m.phase=="query" && m.id==qid)
        st.textContent=m.message;
    }
    else if (m.type === "results" && m.id === qid) render(m);
    else if (m.type === "browse" && m.id === qid) { browseTotal = m.total; lastVids = m.offset ? lastVids.concat(m.vids) : m.vids; renderBrowse(); }
    else if (m.type === "video" && m.id === vid && m.video) renderTranscript(m.video); };
  w.onerror=function (event) {
    pending_edit?.reject(new Error(event.message || "Search worker stopped."));
    pending_edit=null;w.terminate();w=null;
    st.textContent="Search stopped. Close and reopen this window to retry.";
  };
  w.postMessage({type:"load",base:"./assets/transcripts/"});syncFromQuery(); };
q.addEventListener("input", () => { qid++;syncFromQuery(); clearTimeout(deb); deb = setTimeout(ask, 250); });
$("tsClear").addEventListener("click", () => { q.value = ""; syncFromQuery(); ask(); q.focus(); });
$("tsHelp").addEventListener("click", () => $("tsHelp").classList.toggle("open"));   // tap support (hover covers desktop)
ov.addEventListener("pointerdown", (e) => { if (e.target === ov) ov.classList.remove("open"); });
const open = () => { ov.classList.add("open"); WinRaise(ov); init(); setTimeout(() => q.focus(), 50); };
$("tsClose").addEventListener("click", () => ov.classList.remove("open", "free"));
export {open as Open};
