# Window decoration reference

The browser frames follow TempleOS V5.03's drawing code. HTML controls still
handle dragging, resizing, MENU and close. Native task addresses and editor
status fields have no browser equivalent and are omitted in both renderers.

| Feature | V5.03 source | HTML/CSS reproduction |
| --- | --- | --- |
| Border | `Adam/Gr/GrTextBase.HC`, `TextBorder` | CSS rules and `Kernel/FontStd.HC` corner glyphs 6–13; single unfocused, double focused |
| Title | `Adam/DolDoc/DocTerm.HC`, `DocBorderNew`; `DocRecalc` | Inverted, centered on whole cells, 15 cells; `title...` advances at 64 pixels/second |
| Title phase | `GrUpdateTextBG/FG` | Blue background clears the beginning of each cell before its shifted glyph; no smooth subpixel motion |
| MENU | `DocBorderNew`, `Kernel/KMisc.HC` | Four cells at x=8; blue/white invert every 200 ms |
| Close | `DocBorderNew` | Three cells immediately before the right border; a partial preceding cell clears to white |
| Left description | `DocBorderLstDraw` | Up to eight characters from the title's first word, one per cell; short windows retain the suffix |
| Scroll handles | `Adam/Ctrls/CtrlsA.HC`, `WinDerivedScrollValsUpdate`, `DrawWinScroll` | 8×8, yellow outer two pixels and blue 4×4 center; colors swap when held |
| Scroll positions | `WinDerivedScrollValsUpdate` | Start four pixels from the outer corner; advance by the document fraction of the inner dimension; vertical handle draws last |

`python Adam/WinChromeMk.py` builds WOFF2 fonts from the compiler runtime's
`FONT`, extracted from V5.03's `sys_font_std`. Building requires Python
`fonttools[woff]`; visitors need no font-building code or dependencies.
Font outlines are rectangles aligned to the selected DPI's pixel grid. Fractional
scales include the horizontal phases needed to shift a title on the original
8×8 grid before scaling. CSS selects them with the `cv01` font feature.

Borders and scroll handles use CSS rules. Corners, MENU, the title, the close
control and the left description use the font. There are no decoration images.
The default 125% font is 10,436 bytes, fetched once; changing DPI fetches that
scale's font on demand. All five fonts total 35,092 bytes. Popup windows share
the opener's FontFace objects rather than creating new font loads.

The abandoned per-DPI image expansion totaled 165,544 bytes, with 27,020 bytes
needed at 125%. Its two glyph atlases alone decoded to 1,843,200 RGBA bytes at
125%. The selected font expands to a 109,276-byte SFNT; that is font data size,
not a measurement of total browser font-cache memory. The older three-image
version was smaller on the wire (4,711 bytes), but did not match fractional DPI.

JavaScript sets text when titles change. A title is one text node, instead of
one element per character. CSS handles focus, blinking and stepped motion;
scroll and resize events update handle positions. No per-frame JavaScript or
HolyC drawing runtime is added to the HTML/CSS mode. The optional HolyC renderer
remains available. Reduced motion freezes MENU and the title at time zero in
both modes.

## Evidence and limits

- `node Adam/WinDrawRef.mjs`: compares 173,568 border pixels in 40 cases with original guest
  `TextBorder`, `DocBorderNew`/`DocRecalc`, `DocBorderLstDraw` and `DrawWinScroll`,
  with graphics shortcuts disabled.
- `node Adam/WinChrome.browser.mjs`: compares actual browser screenshots against
  that HolyC renderer, covering focus, blinking, title phase/wrap, narrow/partial
  cells, short descriptions, scroll position, pressed handles and all five DPI
  settings. The comparison includes the interior and surrounding pixels to catch
  spill outside the frame. The expected images
  are not generated from the CSS implementation.
- `node Adam/WinDraw.browser.mjs`: checks renderer switching, pointer and keyboard
  controls, popup windows, DPI preferences, reduced motion and load failure.

Pixel equality is tested on Chromium at 100%, 125%, 150%, 175% and 200%,
with whole-pixel window positions. Arbitrary browser zoom, device scale and
fractional placement can change compositor rasterization and are not a claim
of universal physical-screen pixel equality. The comparison covers browser
frame fields, not full TempleOS application documents, task addresses or editor
status fields. Animation phase is relative to the browser animation timeline
rather than the guest's clock.

Some native description glyphs extend left of the visible border rule, and
`[X]` extends above and below the horizontal rules. This is present in V5.03;
the boundary is the complete 8×8 cell, not the thin rule. Exceptionally narrow
native titles can spill beyond a window because the guest uses an unclipped
text write. Browser frames clip at their outer boundary.
