# Native media clippers

`clip/Mp4.HC` parses MP4/MOV sample tables and writes a standalone MP4 with
rebased decode/composition times and edit lists. It copies encoded packets;
there is no codec, decoder, encoder or FFmpeg download in the browser path.
JavaScript handles HTTP byte ranges, WASM memory transfer, cancellation and the
file download. Each export has its own worker, so closing it releases its memory.

Current limits: unfragmented, self-contained audio/video tracks, one sample
format per track, ordinary empty/linear edits at playback rate 1; at most eight
tracks, two million total samples, 64 MiB metadata, 256 MiB output, ten minutes.
Unsupported fragmented/encrypted/external-reference files are rejected.

`clip/Mkv.HC` reads Matroska/WebM SeekHead, tracks and Cues, then copies only the
selected clusters. It rebases timestamps, keeps codec data and audio/video
packets, and removes stale byte offsets and checksums. A cue may point inside a
cluster: earlier dependent video blocks are excluded until its first keyframe;
up to one second of that cluster's preceding audio remains available. This is a
keyframe-aligned export, not a frame-exact cut. The UI and filename show the
actual expanded range. MP4/MOV retain their exact presentation edit lists.

Matroska limits: one video and up to 15 audio tracks, known-size clusters and
usable cues; metadata and individual clusters at most 16 MiB, output at most
256 MiB, requested interval at most ten minutes. Linked, encrypted, combined,
offset/scaled tracks and changing codec state are rejected. The older playback
conversion fallback remains for formats outside these native parsers; removing
it before replacing those formats would remove existing functionality.

`Range.js` rejects ignored ranges, changing ETags/lengths, truncated and excess
bodies before accepting them. Reads are capped at the CDN route's 16 MiB limit.
The CDN archive route is allowlisted from the transcript index. It must be
deployed before the new Search UI can read live archive bytes in a browser;
local browser tests intercept it with a real fixture response.

Checks (Node, ffmpeg/ffprobe and Chromium installed):

```
npm run test:clip
HOLYC_WASM=/path/to/HolyC-wasm node tools/clip/native.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/clip/mkv-native.mjs
node tools/clip/archive.mjs
node tools/clip/archive.mjs mkv
node tools/clip/archive.mjs webm
```

The archive commands read real videos over HTTP; they are optional network
checks. Native verification requires QEMU/KVM or the oracle's TCG alternative and
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

Fifteen MKV/WebM cuts use independent FFmpeg/ffprobe packet hashes, presentation
timestamps and decoded pictures, including H.264 B-frames, AAC, VP9/Opus, short
clusters, keyframe and file-end boundaries. Native V5.03 and WASM output lengths
and FNV-1a hashes match for both containers; browser downloads match the verified
WASM bytes. Lacing tests use the Matroska specification's Xiph/EBML sizes and
reject malformed input. Matroska PCM equivalence is not claimed: decoder
preroll and synthesis state can affect the beginning of a lossless clip.

Format reference:
https://developer.apple.com/documentation/quicktime-file-format
https://www.matroska.org/technical/elements.html
https://www.matroska.org/technical/notes.html

The compiler pin includes cross-function exception handling. Malformed metadata
returns the native diagnostic through the parser catch. Chromium validation and
execution of the resulting WASM exception-handling module are part of the browser
clip check; other browser/CPU targets still require their own runs.

Native malformed-input checks repeat 256 MP4 and 640 Matroska failures, verify
the TempleOS exception chain is restored after every call, then handle a fresh
exception and produce the same valid clip hashes. Parser catches mark the
exception handled and return only after leaving the catch. Allocation checks
cover all three MP4 and fourteen Matroska failure positions, repeated metadata
replacement and finishing, full cleanup and successful retries.
