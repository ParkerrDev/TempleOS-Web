//The window manager: TempleOS's chrome on every window, raising, dragging,
//and the windows the Menu opens, each loaded the first time it opens.
const $ = (id) => document.getElementById(id);
let zTop = 1000;   // one stack for every window, overlay and video window
let unsized = [];   // dressed windows whose title has not been sized
const closeWin = (w) => { w.style.display = "none"; if (w._ph) { w._ph.remove(); w._ph = null; } };
const makeDraggable = (w, handle, raiseFn) => {
  const raise = raiseFn || (() => { w.style.zIndex = ++zTop; });
  w.addEventListener("pointerdown", () => { if (w.dataset.floating) raise(); }, true);
  handle.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch") return;   // touch never moves windows; the bar pans the page like everything else
    if (e.target.closest(".close,button,select,a,input,textarea")) return;
    const r = w.getBoundingClientRect();
    if (!w.dataset.floating) {
      if (!w.closest(".overlay")) {                       // overlays are already fixed-context
        const ph = document.createElement("div");
        ph.className = "win-ph"; ph.style.width = r.width + "px"; ph.style.height = r.height + "px";
        ph.style.flex = "0 0 auto"; ph.style.margin = getComputedStyle(w).margin;
        w.parentNode.insertBefore(ph, w); w._ph = ph;
      }
      w.dataset.floating = "1";
      w.style.position = "fixed"; w.style.margin = "0";
      w.style.left = r.left + "px"; w.style.top = r.top + "px";
      w.style.width = r.width + "px";   // height stays auto so content can grow (e.g. Menu's reopen buttons)
    }
    raise();
    const sx = e.clientX - parseFloat(w.style.left), sy = e.clientY - parseFloat(w.style.top);
    const move = (ev) => {
      w.style.left = Math.max(40 - w.offsetWidth, Math.min(innerWidth - 40, ev.clientX - sx)) + "px";
      w.style.top = Math.max(0, Math.min(innerHeight - 24, ev.clientY - sy)) + "px";
    };
    const up = () => { handle.removeEventListener("pointermove", move); handle.removeEventListener("pointerup", up); handle.removeEventListener("pointercancel", up); };
    try { handle.setPointerCapture(e.pointerId); } catch {}
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
    e.preventDefault();
  });
};
// border-image cells, painted to the EXACT framebuffer-measured patterns.
// focused (double): V = 2W 2B 1W 2B 1W · H = 2W 1B 1W 1B 3W; unfocused (single): centered strokes.
{ // 24x24 border-image, 8px cells, the 1:1 framebuffer-measured patterns.
  // Corners are proper 90-degree JOINS (the lines turn, they never cross):
  // outer stroke turns at its own offset, inner stroke at its deeper offset.
  const mk = (focused) => {
    const c = document.createElement("canvas"); c.width = c.height = 42;
    const g = c.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, 42, 42);
    g.fillStyle = "#0000A8";
    // [offset, thickness] from the outside. V = vertical strokes (2px), H = horizontal (1px).
    const V = focused ? [[3, 3], [8, 3]] : [[5, 3]];
    const H = focused ? [[3, 2], [7, 2]] : [[5, 2]];
    // edge bands (the middle 8px slice of each side)
    for (const [o, t] of H) { g.fillRect(14, o, 14, t); g.fillRect(14, 42 - o - t, 14, t); }
    for (const [o, t] of V) { g.fillRect(o, 14, t, 14); g.fillRect(42 - o - t, 14, t, 14); }
    // corners: each V/H stroke pair turns at the SAME rank (outer with outer, inner with inner)
    for (let i = 0; i < V.length; i++) {
      const [vo, vt] = V[i], [ho, ht] = H[i];
      // top-left: vertical run from the horizontal stroke down; horizontal run from the vertical stroke right
      g.fillRect(vo, ho, vt, 28 - ho);               // down into the left edge band
      g.fillRect(vo, ho, 28 - vo, ht);               // right into the top edge band
      g.fillRect(42 - vo - vt, ho, vt, 28 - ho);     // top-right
      g.fillRect(14, ho, 28 - vo, ht);
      g.fillRect(vo, 14, vt, 28 - ho);               // bottom-left
      g.fillRect(vo, 42 - ho - ht, 28 - vo, ht);
      g.fillRect(42 - vo - vt, 14, vt, 28 - ho);     // bottom-right
      g.fillRect(14, 42 - ho - ht, 28 - vo, ht);
    }
    return c.toDataURL();
  };
  const st = document.createElement("style");
  st.textContent = `.win, #frame { border-image:url("${mk(0)}") 14 fill / 14px repeat; }
.win.active, #frame.active { border-image:url("${mk(1)}") 14 fill / 14px repeat; }`;
  document.head.appendChild(st);
}
const setActive = (w) => { for (const a of document.querySelectorAll(".active")) a.classList.remove("active"); w.classList.add("active");
  // ...and RAISE it: a window inside an overlay raises the overlay (its stacking context);
  // a static-flow window gets position:relative so z-index applies without moving it.
  const ov = w.closest(".overlay");
  if (ov) ov.style.zIndex = ++zTop;
  else { if (getComputedStyle(w).position === "static") w.style.position = "relative"; w.style.zIndex = ++zTop; } };
const raise = (el) => { el.style.zIndex = ++zTop; };
// dress(): give ANY element the full TempleOS window chrome (bar, marquee, vertical title,
// corner handles, dragging). opts.menuReopen = the static-desktop close behavior (hide +
// reopen button in Menu); opts.onClose = custom [X] handler (e.g. video windows DESTROY);
// opts.raise = custom z-raise (video windows stack in their own tier above the overlay).
const dress = (w, opts = {}) => {
  const bar = document.createElement("div"); bar.className = "wbar";
  const mn = document.createElement("span"); mn.className = "wmenu"; mn.textContent = "MENU";
  const gap = document.createElement("span"); gap.className = "wgap";
  const ti = document.createElement("div"); ti.className = "wtitle";
  const ts = document.createElement("span"); ti.appendChild(ts);
  bar.append(mn, gap, ti);
  const gap2 = document.createElement("span"); gap2.className = "wgap"; bar.appendChild(gap2);
  let x = w.querySelector(":scope > .close");
  if (x) bar.appendChild(x);
  if (x && opts.onClose) x.addEventListener("click", opts.onClose);
  else if (x && opts.menuReopen && w.id !== "frame" && !w.closest(".overlay") && !w.classList.contains("toolbar")) {
    // closing reveals a reopen button in the Menu window; reopening hides it again
    const rb = document.createElement("button");
    rb.style.display = "none";
    rb.innerHTML = '<span class="ico"><svg><use href="#i-window"/></svg></span> ' + w.dataset.title;
    document.querySelector(".toolbar").appendChild(rb);
    x.addEventListener("click", () => { closeWin(w); rb.style.display = ""; });
    rb.addEventListener("click", () => { w.style.display = ""; rb.style.display = "none"; w.classList.add("active"); });
  }
  const v = document.createElement("span"); v.className = "wvert";
  const vt = w.dataset.title.split("·")[0].trim();
  const vs = document.createElement("span"); vs.textContent = vt.length > 16 ? vt.slice(0, 15).trimEnd() + "…" : vt;   // long video titles would run down the whole border
  v.appendChild(vs);
  for (const c of ["tr", "bl"]) { const d = document.createElement("div"); d.className = "wcorn " + c; w.appendChild(d); }
  w.prepend(v); w.prepend(bar);
  w._title = w.dataset.title; w.removeAttribute("data-title"); unsized.push(w);
  w.addEventListener("pointerdown", () => setActive(w), true);
  makeDraggable(w, bar, opts.raise);
  return w;
};
// cycling border titles, DocBorderNew-style: "title..." repeated with NO whitespace, scrolled
// seamlessly (content = 2x a repeated unit, animate to -50%). Size AFTER layout.
const sizeMarquee = (w) => {
  const meas = document.createElement("span");
  meas.style.cssText = "position:absolute;visibility:hidden;white-space:pre;font-size:12px;font-family:'TempleOS','dos_vga',monospace";
  document.body.appendChild(meas);
  const ti = w.querySelector(".wtitle"), ts = ti && ti.firstChild;
  if (ts) {
    const unit = w._title + "...";
    meas.textContent = unit;
    const upx = Math.max(20, meas.getBoundingClientRect().width);
    const n = Math.max(2, Math.ceil((ti.getBoundingClientRect().width || 400) / upx) + 1);
    ts.textContent = unit.repeat(n * 2);
    ts.style.animationDuration = ((upx * n) / 64).toFixed(2) + "s";   // DOC_SCROLL_SPEED(8) * FONT_WIDTH(8) = 64 px/s
  }
  meas.remove();
};
const wins = [...document.querySelectorAll("[data-title]")];
for (const w of wins) dress(w, { menuReopen: true });
setActive($("frame"));
requestAnimationFrame(MarqueesSize);
function MarqueesSize()
{//Sizes the title of each window shown since it was dressed.
  let w,rest=[];
  for (w of unsized)
    if (w.offsetWidth)
      sizeMarquee(w);
    else
      rest.push(w);
  unsized=rest;
}

function OvFree(ov)
{//The [X] at the screen's corner sends the dark backdrop away, and the
//window joins the desktop.
  let b=document.createElement("button");
  function Free()
  {
    ov.classList.add("free");
    raise(ov);
  }
  b.className="ovfree";
  b.title="close the dark backdrop - the window joins the desktop "+
    "(reopen the window to restore)";
  b.addEventListener("click",Free);
  ov.appendChild(b);
}

export function WinAdd(css,html)
{//Puts a window's style in the head and its markup in the page, dressed.
  let st=document.createElement("style"),box=document.createElement("div"),el;
  st.textContent=css;
  document.head.appendChild(st);
  box.innerHTML=html;
  for (el of box.querySelectorAll("[data-title]"))
    dress(el);
  for (el of box.querySelectorAll(".overlay"))
    OvFree(el);
  document.body.append(...box.children);
}

const WINS={editorBtn:"./EditorWin.js",gamesBtn:"./games.js",
  spritesBtn:"./SpritesWin.js",godBtn:"./GodWin.js",diskBtn:"./DiskWin.js",
  tsBtn:"./SearchWin.js",chatBtn:"./ChatWin.js"};

async function WinOpen(id)
{//Opens the window a Menu button names, loading its module the first time.
  let m=await import(WINS[id]);
  m.Open();
  requestAnimationFrame(MarqueesSize);
}

function MenuClick(e)
{
  WinOpen(e.currentTarget.id).catch(console.error);
}

function ChatLoad()
{//Chat connects while the page is idle, to count what arrives while shut.
  import("./ChatWin.js").catch(console.error);
}

function PageLoaded()
{
  if (window.requestIdleCallback)
    requestIdleCallback(ChatLoad,{timeout:5000});
  else
    setTimeout(ChatLoad,2000);
}

for (const id in WINS)
  $(id).addEventListener("click",MenuClick);
addEventListener("load",PageLoaded);
export {dress as WinDress,sizeMarquee as WinMarquee,setActive as WinFocus,
  raise as WinRaise};
