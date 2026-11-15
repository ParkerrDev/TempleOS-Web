# Browser windows in TempleOS

The browser owns HTML/CSS layout and web actions. TempleOS owns native task windows, drawing, input and lifetime. A compact scene transports resolved layout rather than implementing a second CSS engine.

- Replace the per-window DolDoc allowlist with one scene converter and native scene renderer.
  - WinPassDoc knows God Tools DOM IDs and manually reformats its articles.
  - Menu, Help and God Tools have separate hardcoded body/button selectors; Terry and future documents cannot participate.
  - CSS layout, colors, images and button positions are discarded by the text conversion.
  - Canvas frames change without DOM mutations, so a document observer alone cannot synchronize animation.
- Preserve browser layout while native ownership is active; serialize text, rectangular backgrounds/borders, buttons, canvas/image pixels and links. Reject controls with browser-only editing/media semantics.
  - display:none destroys the layout needed for conversion and stops Terry's existing visibility-driven player.
  - Native click targets must call their originating DOM controls and retain stable IDs across updates.
- Return current windows independently of the enabled preference.
  - The floating dock and Return action currently dispatch the disable event.
  - Disabling and restoring ownership are conflated even though return should leave future transfers enabled.
- Use the same native surface coordinates for pointer forwarding and resize/move cursors.
  - Detached task canvases forward mouse input without indicating which border is resizable.

Scope: resolved HTML/CSS presentation, not a complete standalone HTML parser/browser. Native text remains TempleOS's 8x8 font and colors remain its sixteen-color palette. Unsupported media, editable fields, transforms and embedded browsers stay in the web interface. Existing native task capture remains unchanged.

Validation corrections:
- Use the existing HolyC sprite codec for palette quantization; browser glue only reads resolved layout and canvas pixels.
- Pad image rows to eight bytes on both sides of the protocol. HolyC requires `(width+7)&~7`; the ungrouped expression sheared Terry diagonally. A 13-pixel native image fixture now checks successive rows.
- Keep a browser owner and its action routing until native close succeeds. Return preserves failures and the enabled preference.
- Keep drag-return coordinates with the owner until close replies. Native window metadata can report the closure first, so either notification order must restore the same position.
- Update the custom pointer after the target computes its resize cursor, so the first border movement shows one pointer and leaving restores it immediately.
- Retain a dirty update while a scene is in flight, then send the latest layout. Static tools cannot rely on Terry's animation timer to retry.
- Saved machines containing the older native structure receive explicit Restart guidance before field offsets are accessed.
- Scroll containers retain native keyboard/wheel actions and clipping. Native clicks, animation, the Random video action, cheatsheet page/end scrolling and Return were exercised against the running guest.
