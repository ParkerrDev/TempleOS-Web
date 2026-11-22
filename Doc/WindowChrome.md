# Window decoration reference

The browser frames follow TempleOS V5.03's drawing code. HTML controls still
handle dragging, resizing, MENU and close. Native task addresses and editor
status fields have no browser equivalent and are omitted in both renderers.

| Feature | V5.03 source | HTML/CSS reproduction |
| --- | --- | --- |
| Border | `Adam/Gr/GrTextBase.HC`, `TextBorder` | `Kernel/FontStd.HC` glyphs 2–13 in an 8-pixel border image; single unfocused, double focused |
| Title | `Adam/DolDoc/DocTerm.HC`, `DocBorderNew`; `DocRecalc` | Inverted, centered on whole cells, at most 15 cells; `title...` advances at 64 pixels/second |
| Title phase | `GrUpdateTextBG/FG` | Blue background clears the beginning of each cell before its shifted glyph; no smooth subpixel motion |
| MENU | `DocBorderNew`, `Kernel/KMisc.HC` | Four cells at x=8; blue/white invert every 200 ms |
| Close | `DocBorderNew` | Three cells immediately before the right border; a partial preceding cell clears to white |
| Left description | `DocBorderLstDraw` | Up to eight characters from the title's first word, one per cell |
| Scroll handles | `Adam/Ctrls/CtrlsA.HC`, `WinDerivedScrollValsUpdate`, `DrawWinScroll` | 8×8, yellow outer two pixels and blue 4×4 center; colors swap when held |
| Scroll positions | `WinDerivedScrollValsUpdate` | Start four pixels from the outer corner; advance by the document fraction of the inner dimension; vertical handle draws last |

`Adam/WinChromeMk.mjs` extracts the font pixels into the three checked-in PNG
assets. It reads the compiler runtime's `FONT`, extracted from V5.03's
`sys_font_std`. The assets total under 5 KB. It does not rasterize a desktop font
or draw approximate corners. Run it after updating that font source.

The live CSS path uses those images as border images and glyph backgrounds.
JavaScript creates title glyph spans when a title changes; CSS handles drawing,
focus, blinking and stepped motion. No per-frame JavaScript or drawing runtime
is added. The optional HolyC renderer remains available. Reduced motion freezes
MENU and the title at phase zero in both modes.

## Evidence and limits

- `node Adam/WinDrawRef.mjs`: compares 29,696 border pixels with original guest
  `TextBorder`, `DocBorderNew`/`DocRecalc`, `DocBorderLstDraw` and `DrawWinScroll`,
  with graphics shortcuts disabled.
- `node Adam/WinChrome.browser.mjs`: compares actual browser screenshots against
  that HolyC renderer, covering focus, blinking, title phase/wrap, narrow/partial
  cells, scroll position, pressed handles and integer DPI. The expected images
  are not generated from the CSS implementation.
- `node Adam/WinDraw.browser.mjs`: checks renderer switching, pointer and keyboard
  controls, popup windows, DPI preferences, reduced motion and load failure.

Pixel equality is tested on Chromium at 100% and 200%, with whole-pixel window
positions. Fractional DPI, fractional placement and browser zoom resample the
8×8 source grid. The comparison covers browser frame fields, not full TempleOS
application documents, task addresses or editor status fields. Animation phase
is relative to the browser animation timeline rather than the guest's clock.
