# Native MP4 clipper

`clip/Mp4.HC` parses MP4/MOV sample tables and writes a standalone MP4 with
rebased decode/composition times and edit lists. It copies encoded packets;
there is no codec, decoder, encoder or FFmpeg download in the browser path.
JavaScript handles HTTP byte ranges, WASM memory transfer, cancellation and the
file download. Each export has its own worker, so closing it releases its memory.

Current limits: unfragmented, self-contained audio/video tracks, one sample
format per track, ordinary empty/linear edits at playback rate 1; at most eight
tracks, two million total samples, 64 MiB metadata, 256 MiB output, ten minutes.
Unsupported fragmented/encrypted/external-reference files are rejected. Other
containers, including Matroska/WebM, are not connected yet. The older player
conversion fallback is still present and remains separate work.

`Range.js` rejects ignored ranges, changing ETags/lengths, truncated and excess
bodies before accepting them. Reads are capped at the CDN route's 16 MiB limit.
The CDN archive route is allowlisted from the transcript index. It must be
deployed before the new Search UI can read live archive bytes in a browser;
local browser tests intercept it with a real fixture response.

Checks (Node, ffmpeg/ffprobe and Chromium installed):

```
npm run test:clip
HOLYC_WASM=/path/to/HolyC-wasm node tools/clip/native.mjs
node tools/clip/archive.mjs
```

The last command reads a real archive video over HTTP; it is an optional network
check. Native verification requires QEMU/KVM or the oracle's TCG alternative and
the independently pinned V5.03 oracle inputs described in HolyC-wasm.

The generated fixture has H.264 B-frames, periodic keyframes and AAC priming.
Independent ffprobe packet hashes show that every exported packet is an unchanged
contiguous subsequence of its source track. Six cuts exercise start, keyframe,
sub-frame and file-end boundaries. Video frames and PCM alignment are compared
against independently decoded source ranges. The PCM alignment fixture disables
AAC perceptual noise substitution: that decoder feature has a stateful RNG, so
restarting a decoder can change synthesized noise even when packets are identical.
The ordinary PNS-enabled fixture remains covered by packet hashes. Source:
https://ffmpeg.org/doxygen/8.1/aacdec__proc__template_8c_source.html

Native V5.03/QEMU and WASM produce the same size and FNV-1a hash for the checked
fixture. The browser download is compared byte-for-byte to that WASM file.
Malformed atom sizes, counts, timescales and sample ranges are rejected. The
browser check covers Search and standalone player controls, cancellation,
failed range requests and mobile width.

Format reference:
https://developer.apple.com/documentation/quicktime-file-format

A current compiler limitation remains recorded separately: before the exception
semantics change, HolyC-wasm traps at a thrown exception instead of executing the
native catch. The host reports the parser's stored diagnostic in that case;
this is not counted as proof of language exception parity.
