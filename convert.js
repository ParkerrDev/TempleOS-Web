// convert.js — shared in-browser video converter (ffmpeg.wasm, vendored, single-thread: no
// cross-origin isolation needed). Used by the Terry Search video windows (index.html) and the
// standalone player page (player.html). The input bytes come from archive.org's /cors/ endpoint —
// their /download/ nodes send no CORS so fetch() can't read those, but /cors/ serves full files
// with CORS (verified live; Range is ignored there).
//
// One ffmpeg instance + one cached input file per page; conversions are serialized (a second
// request waits). Unsupported formats re-encode a `win`-second window from `start` (x264
// ultrafast 480p + aac — ~4x realtime on the 2007 640x480 screen captures); .mkv/.mov first try
// a stream-copy remux (instant h264/aac mp4, the Firefox/Safari case).

const CORSBASE = "https://archive.org/cors/TerryADavis_TempleOS_Archive/";
let ff = null, curF = null, busy = false;

export async function convertVideo({ f, start = 0, win = 600, onStatus = () => {} }) {
  while (busy) { onStatus("waiting for another conversion to finish…"); await new Promise((r) => setTimeout(r, 500)); }
  busy = true;
  try {
    if (!ff) {
      onStatus("loading converter (31 MB, one-time)…");
      const { FFmpeg } = await import("./vendor/ffmpeg/ffmpeg/index.js");
      ff = new FFmpeg();
      await ff.load({ coreURL: new URL("vendor/ffmpeg/core/ffmpeg-core.js", location.href).href,
                      wasmURL: new URL("vendor/ffmpeg/core/ffmpeg-core.wasm", location.href).href });
    }
    if (curF !== f) {
      if (curF !== null) { try { await ff.deleteFile("in"); } catch {} }
      curF = null;
      const resp = await fetch(CORSBASE + f.split("/").map(encodeURIComponent).join("/"));
      if (!resp.ok) throw new Error("archive.org fetch failed (" + resp.status + ")");
      const total = Number(resp.headers.get("content-length")) || 0;
      if (total > 400e6) throw new Error("file too large to convert in-browser (" + (total / 1e6 | 0) + " MB > 400 MB)");
      const rd = resp.body.getReader(), parts = []; let got = 0;
      for (;;) { const { done, value } = await rd.read(); if (done) break;
        parts.push(value); got += value.length;
        onStatus("downloading video… " + (total ? Math.round(got * 100 / total) + "%" : (got / 1e6 | 0) + " MB")); }
      const all = new Uint8Array(got); let o = 0; for (const p of parts) { all.set(p, o); o += p.length; }
      await ff.writeFile("in", all);
      curF = f;
    }
    try { await ff.deleteFile("out.mp4"); } catch {}
    const ext = (f.split(".").pop() || "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    const prog = ({ time }) => onStatus("converting… " + Math.min(100, Math.round((time || 0) / 1e6 * 100 / win)) + "%");
    ff.on("progress", prog);
    let full = false;
    try {
      if ((ext === "mkv" || ext === "mov") && start === 0) {       // fast path: no re-encode
        onStatus("remuxing (no re-encode)…");
        full = (await ff.exec(["-i", "in", "-c", "copy", "-movflags", "faststart", "out.mp4"])) === 0;
      }
      if (!full) {
        onStatus("converting… 0%");
        const rc = await ff.exec(["-ss", String(start), "-i", "in", "-t", String(win),
          "-vf", "scale=-2:480", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28",
          "-c:a", "aac", "-b:a", "96k", "-movflags", "faststart", "out.mp4"]);
        if (rc !== 0) throw new Error("conversion failed (ffmpeg rc " + rc + ")");
      }
    } finally { ff.off("progress", prog); }
    const out = await ff.readFile("out.mp4");
    onStatus("");
    return { blobUrl: URL.createObjectURL(new Blob([out.buffer], { type: "video/mp4" })), windowed: !full, start, win };
  } finally { busy = false; }
}
