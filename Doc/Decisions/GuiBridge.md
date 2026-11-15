# Browser windows in TempleOS

The browser owns HTML/CSS layout and web actions. TempleOS owns native task windows, drawing, input and lifetime. A compact scene transports resolved layout rather than implementing a second CSS engine.

- Replace the per-window DolDoc allowlist with one scene converter and native scene renderer.
  - WinPassDoc knows God Tools DOM IDs and manually reformats its articles.
  - Menu, Help and God Tools have separate hardcoded body/button selectors; Terry and future documents cannot participate.
  - CSS layout, colors, images and button positions are discarded by the text conversion.
  - Canvas frames change without DOM mutations, so a document observer alone cannot synchronize animation.
- Preserve browser layout while native ownership is active; serialize text, rectangular backgrounds/borders, buttons, canvas/image pixels and links. Use native editing tasks and relay accepted values and actions to browser services. Video Player and Sprite Studio remain browser windows.
  - display:none destroys the layout needed for conversion and stops Terry's existing visibility-driven player.
  - Native click targets must call their originating DOM controls and retain stable IDs across updates.
- Return current windows independently of the enabled preference.
  - The floating dock and Return action currently dispatch the disable event.
  - Disabling and restoring ownership are conflated even though return should leave future transfers enabled.
- Use the same native surface coordinates for pointer forwarding and resize/move cursors.
  - Detached task canvases forward mouse input without indicating which border is resizable.

Scope: resolved HTML/CSS presentation, not a complete standalone HTML parser/browser. Native text remains TempleOS's 8x8 font and colors remain its sixteen-color palette. Editable fields use native DocEd tasks; selects use native list pickers. SVGs are resolved and quantized through the HolyC sprite codec. Only Video Player and Sprite Studio are excluded among the site tools; browser file pickers and permissions remain browser operations. Existing native task capture remains unchanged.

Validation corrections:
- Use the existing HolyC sprite codec for palette quantization; browser glue only reads resolved layout and canvas pixels.
- Pad image rows to eight bytes on both sides of the protocol. HolyC requires `(width+7)&~7`; the ungrouped expression sheared Terry diagonally. A 13-pixel native image fixture now checks successive rows.
- Keep a browser owner and its action routing until native close succeeds. Return preserves failures and the enabled preference.
- Keep drag-return coordinates with the owner until close replies. Native window metadata can report the closure first, so either notification order must restore the same position.
- Update the custom pointer after the target computes its resize cursor, so the first border movement shows one pointer and leaving restores it immediately.
- Retain a dirty update while a scene is in flight, then send the latest layout. Static tools cannot rely on Terry's animation timer to retry.
- Saved machines containing the older native structure receive explicit Restart guidance before field offsets are accessed.
- Scroll containers retain native keyboard/wheel actions and clipping. Native clicks, animation, the Random video action, cheatsheet page/end scrolling and Return were exercised against the running guest.

Expanded controls and routing:
- Native pointer press, release and movement carry control identity and coordinates. The task requests immediate mouse messages so TempleOS does not merge two presses into a delayed double-click message.
- Browser input handlers ignore relayed native mouse events when deciding whether to reset OS input. Otherwise a press on a native field moved the guest pointer to the center before release.
- Browser window focus resolves the native tool under the canvas pointer before notifying context-sensitive tools. Focusing the canvas first changed Help's text and moved its buttons during a click.
- A full-size scene covers the desktop callback. Attach its renderer before resizing, then perform the bridge's visibility step from that renderer too. Otherwise the bridge can shut down between window creation and scene allocation. Plain DolDoc windows retain their normal drawing and capture path.
- Window jobs queue on Adam with internal/background ownership, so file reads and native focus requests do not reject each other as concurrent user programs.
- Launch origin is captured before asynchronous loads, then passed explicitly to child tools and the shared save/select dialog. It does not depend on later focus.
- Live tests cover Chat with a local mocked socket, file imports and double-clicks, editor typing/run/save, native dropdowns, Menu and Help child launches, settings, search hover, game preview, disk checkpoints, and the existing Terry/God/cheatsheet flows. No test messages are sent to the public chat.

Chat launch and input follow-up:
- Check launch origin from the native Menu, including Chat's initial focus and asynchronous loading. The existing Chat check only dragged an already-open window into the guest.
- Preserve pointer transitions until the guest samples them. The host currently overwrites its button mask on every message, so a press and release between frames can disappear. Existing native UI tests hold each press for 150 ms, hiding that case.
- Keep native tool ownership explicit across focus changes, and verify ordinary short clicks and typing through the same route users take.

Native input correction:
- Use TempleOS document editing and list pickers for input. A clicked text field opens a real native editing task, single-line Enter accepts, Escape cancels; multiline editing uses DocEd's Escape/save and Shift-Escape/cancel convention. The browser receives values and actions only. This preserves the current resolved layout without inventing another HolyC text editor.
  - HostFocus depends on focusing invisible HTML outside the fullscreen subtree.
  - HostSelect duplicates cursor, selection, and word selection in JavaScript.
  - DOM key navigation and browser hover cursors compete with guest focus and DrawMs.
- Carry native action origin explicitly; scope synchronous backend actions with WinAction.
  - Menu launches incorrectly infer origin from document.activeElement.
  - Asynchronous child launches must capture origin before awaiting imports.
- Fullscreen contains the OS input surface. Letterbox clicks only focus the canvas; incompatible browser tools leave OS fullscreen before display.
  - Frame-margin clicks clamp to guest edges.
  - The custom browser cursor lives outside the fullscreen subtree.
- Preserve mouse edges until the guest window manager has processed them. Tests must use ordinary down/up clicks.
- Native game canvases receive task keyboard messages and guest-relative mouse motion. Browser pointer lock transports motion to the OS canvas; TempleOS owns centering, visibility and capture loss. Keep the canvas control ID separate from the transport request ID.
- Anchor filename glyphs to their CSS line box before clipping. The font extends one pixel outside a clipped span, causing two thirds of filenames to be dropped during conversion.
