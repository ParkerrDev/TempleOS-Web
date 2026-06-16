// xsel.js — TempleOS-style text selection: selecting normal text XOR-inverts the
// colors under it, exactly like the OS (Adam/DolDoc/DocRecalc.HC: a selected entry does
// i^=0xF — complement the palette index). The browser's native ::selection can only set
// a fixed colour, so we hide it and lay white mix-blend-mode:difference rectangles over
// the selection's client-rects (== RGB invert for the standard palette). Desktop only.
//
// Textareas/inputs render their own selection (not reachable via Range), so they fall
// back to a themed fixed ::selection instead of a true invert.
//
//   import "./xsel.js";   // self-initialises on desktop

if (!(navigator.maxTouchPoints > 0 || "ontouchstart" in window)) {
  const style = document.createElement("style");
  style.textContent =
    "::selection{background:transparent}" +                          // normal text: invert via overlay
    "::-moz-selection{background:transparent}" +
    "textarea::selection,input::selection{background:#0000A8;color:#fff}" +  // fields: themed fallback
    "textarea::-moz-selection,input::-moz-selection{background:#0000A8;color:#fff}";
  (document.head || document.documentElement).appendChild(style);

  let divs = [], raf = 0;
  const clear = () => { for (const d of divs) d.remove(); divs.length = 0; };
  const build = () => {
    raf = 0; clear();
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;
    for (let i = 0; i < sel.rangeCount; i++) {
      const rects = sel.getRangeAt(i).getClientRects();
      for (const r of rects) {
        if (r.width < 0.5 || r.height < 0.5) continue;
        const d = document.createElement("div");
        d.className = "xsel-rect";
        d.style.cssText = "position:fixed;background:#fff;mix-blend-mode:difference;" +
          "pointer-events:none;z-index:2147483646;left:" + r.left + "px;top:" + r.top +
          "px;width:" + r.width + "px;height:" + r.height + "px";
        document.body.appendChild(d); divs.push(d);
      }
    }
  };
  const schedule = () => { if (!raf) raf = requestAnimationFrame(build); };
  document.addEventListener("selectionchange", schedule);
  addEventListener("scroll", schedule, true);   // capture: also catches nested scrollers
  addEventListener("resize", schedule);
}
