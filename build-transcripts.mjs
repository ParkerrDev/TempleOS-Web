// build-transcripts.mjs — compile the TerryADavis-archive-transcriber output (one Whisper JSON per
// video) into compact, sharded, gzipped chunks the static site can fuzzy-search client-side.
//   node build-transcripts.mjs [path-to-transcripts-dir]
// Emits assets/transcripts/shard-NN.json.gz + manifest.json. Each shard is a JSON array of videos:
//   { t: title, d: "YYYY-MM-DD", f: "videos/2007/....wmv" (path within the archive.org item),
//     n: duration seconds, s: [[startSec, "chunk text"], ...] }
// Whisper artifacts are cleaned at build time: consecutive duplicate segments (the classic
// "Thank you. Thank you. ..." hallucination loop) collapse to one, and tiny segments merge into
// ~250-char windows so a search hit carries enough context to read.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join, basename } from "node:path";

const SRC = process.argv[2] || "TerryADavis-archive-transcriber/output/transcripts";
const OUT = "assets/transcripts";
const CHUNK_CHARS = 250;            // merge segments up to ~this many chars per searchable chunk
const CHUNK_GAP_S = 30;             // ...but never across a silence gap longer than this
const SHARD_RAW_BYTES = 2 * 1024 * 1024;   // split shards at ~2MB raw JSON (~600KB gzipped)

const files = readdirSync(SRC).filter((f) => f.endsWith(".json")).sort();
console.log(`${files.length} transcript JSONs from ${SRC}`);

// collapse "X. X. X. X." runs inside one segment to a single X (whisper loop hallucination)
function collapseLoops(text) {
  const parts = text.split(/(?<=[.!?])\s+/);
  const out = [];
  for (const p of parts) { if (p && p !== out[out.length - 1]) out.push(p); }
  return out.join(" ");
}

const videos = [];
let segsIn = 0, chunksOut = 0, skipped = 0;
for (const f of files) {
  let j;
  // Whisper emits bare NaN for some logprobs — fine for Python's json, fatal for JSON.parse.
  try { j = JSON.parse(readFileSync(join(SRC, f), "utf8").replace(/\bNaN\b/g, "0")); } catch { skipped++; continue; }
  const path = (j.source && j.source.filename) || f.replace(/ -- /g, "/").replace(/\.json$/, "");
  const base = basename(path).replace(/\.[a-z0-9]+$/i, "");
  const dm = base.match(/^(\d{4}-\d{2}-\d{2})T[\d:+.]+(?:\+00:00)?\s*-\s*(.*)$/);
  const date = dm ? dm[1] : (base.match(/^(\d{4}-\d{2}-\d{2})/) || [, ""])[1];
  const title = (dm ? dm[2] : base).trim() || base;
  const dur = Math.round((j.transcription && j.transcription.duration_seconds) || 0);

  // segments -> cleaned, merged chunks
  const segs = Array.isArray(j.segments) ? j.segments : [];
  segsIn += segs.length;
  const chunks = [];
  let curStart = -1, curEnd = -1, cur = "", last = "";
  const flush = () => { if (cur) { chunks.push([Math.max(0, Math.round(curStart)), cur]); cur = ""; } };
  for (const s of segs) {
    let t = String(s.text || "").trim();
    if (!t) continue;
    t = collapseLoops(t);
    if (t === last) continue;                      // consecutive duplicate segments -> keep one
    last = t;
    const st = Number(s.start) || 0;
    if (cur && (cur.length >= CHUNK_CHARS || st - curEnd > CHUNK_GAP_S)) flush();
    if (!cur) curStart = st;
    cur += (cur ? " " : "") + t;
    curEnd = Number(s.end) || st;
  }
  flush();
  chunksOut += chunks.length;
  if (chunks.length) videos.push({ t: title, d: date, f: path, n: dur, s: chunks });
}
videos.sort((a, b) => (a.d + a.t).localeCompare(b.d + b.t));
console.log(`${videos.length} videos kept (${skipped} unparsable), ${segsIn} segments -> ${chunksOut} chunks`);

mkdirSync(OUT, { recursive: true });
const shards = [];
let cur = [], curBytes = 0, rawTotal = 0, gzTotal = 0;
const flushShard = () => {
  if (!cur.length) return;
  const name = `shard-${String(shards.length).padStart(2, "0")}.json.gz`;
  const raw = Buffer.from(JSON.stringify(cur));
  const gz = gzipSync(raw, { level: 9 });
  writeFileSync(join(OUT, name), gz);
  shards.push({ f: name, v: cur.length });
  rawTotal += raw.length; gzTotal += gz.length;
  cur = []; curBytes = 0;
};
for (const v of videos) {
  const sz = JSON.stringify(v).length;
  if (curBytes + sz > SHARD_RAW_BYTES && cur.length) flushShard();
  cur.push(v); curBytes += sz;
}
flushShard();
writeFileSync(join(OUT, "manifest.json"), JSON.stringify({
  archive: "TerryADavis_TempleOS_Archive",
  videos: videos.length, chunks: chunksOut, shards,
  built: new Date().toISOString().slice(0, 10),
}));
console.log(`${shards.length} shards: ${(rawTotal / 1e6).toFixed(1)} MB raw -> ${(gzTotal / 1e6).toFixed(1)} MB gz in ${OUT}/`);
