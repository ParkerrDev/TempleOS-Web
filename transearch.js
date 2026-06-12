// transearch.js — Terry A. Davis transcript fuzzy-search worker (zero dependencies).
// Loads the prebuilt shards (assets/transcripts/, see build-transcripts.mjs), builds a vocabulary,
// and answers queries with typo-tolerant matching: each query token matches exactly OR via
// bounded Damerau-Levenshtein alternates drawn from the corpus vocabulary, with phrase and
// word-boundary bonuses. Results carry the source video (title/date/archive path) + timestamp.

let videos = [];          // { t, d, f, n, s:[[sec,text],...] }
let chunkV = [];          // chunk -> video index
let chunkI = [];          // chunk -> index into video.s
let lower = [];           // chunk -> lowercase text
let vocab = new Map();    // word -> occurrence count
let vocabByLen = [];      // word length -> [words]
let ready = false;

onmessage = (e) => {
  const m = e.data;
  if (m.type === "load") load(m.base).catch((err) => postMessage({ type: "error", message: String(err && err.message || err) }));
  else if (m.type === "query") query(String(m.q || ""), m.id);
};

async function load(base) {
  const man = await (await fetch(base + "manifest.json")).json();
  for (let k = 0; k < man.shards.length; k++) {
    const resp = await fetch(base + man.shards[k].f);
    if (!resp.ok) throw new Error("shard fetch " + resp.status);
    const arr = JSON.parse(await new Response(resp.body.pipeThrough(new DecompressionStream("gzip"))).text());
    for (const v of arr) {
      const vi = videos.length; videos.push(v);
      for (let i = 0; i < v.s.length; i++) { chunkV.push(vi); chunkI.push(i); lower.push(v.s[i][1].toLowerCase()); }
    }
    postMessage({ type: "progress", loaded: k + 1, total: man.shards.length, videos: videos.length, chunks: lower.length });
  }
  for (const t of lower) for (const w of t.split(/[^a-z0-9']+/)) if (w.length >= 3 && w.length <= 24) vocab.set(w, (vocab.get(w) || 0) + 1);
  for (const w of vocab.keys()) { const L = w.length; (vocabByLen[L] || (vocabByLen[L] = [])).push(w); }
  ready = true;
  postMessage({ type: "ready", videos: videos.length, chunks: lower.length, words: vocab.size });
}

// bounded Damerau-Levenshtein: returns distance if <= maxEd, else maxEd+1 (banded DP, early exit)
function dlDist(a, b, maxEd) {
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > maxEd) return maxEd + 1;
  let prev2 = null, prev = new Array(lb + 1), cur = new Array(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;
  for (let i = 1; i <= la; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    const lo = Math.max(1, i - maxEd), hi = Math.min(lb, i + maxEd);
    for (let j = 1; j <= lb; j++) {
      if (j < lo || j > hi) { cur[j] = maxEd + 1; continue; }
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + cost);
      cur[j] = v; if (v < rowMin) rowMin = v;
    }
    if (rowMin > maxEd) return maxEd + 1;
    prev2 = prev; prev = cur; cur = new Array(lb + 1);
  }
  return prev[lb] <= maxEd ? prev[lb] : maxEd + 1;
}

// fuzzy alternates for one query token, from the corpus vocabulary
function altsFor(tok) {
  const out = [];
  if (tok.length < 4) return out;                       // short tokens: exact only (fuzz = noise)
  const maxEd = tok.length >= 8 ? 2 : 1;
  for (let L = tok.length - maxEd; L <= tok.length + maxEd; L++) {
    const bucket = vocabByLen[L]; if (!bucket) continue;
    for (const w of bucket) {
      if (w === tok) continue;
      const d = dlDist(tok, w, maxEd);
      if (d <= maxEd) out.push({ w, d, c: vocab.get(w) });
    }
  }
  out.sort((a, b) => a.d - b.d || b.c - a.c);
  return out.slice(0, 6);
}

function query(q, id) {
  if (!ready) { postMessage({ type: "results", id, hits: [], note: "loading" }); return; }
  const ql = q.toLowerCase().trim();
  const toks = ql.split(/[^a-z0-9']+/).filter((w) => w.length >= 2);
  if (!toks.length) { postMessage({ type: "results", id, hits: [] }); return; }
  // matchers per token: [{ w, score }] — exact token first, then fuzzy alternates
  const matchers = toks.map((tok) => {
    const m = [{ w: tok, s: 3 }];
    for (const a of altsFor(tok)) m.push({ w: a.w, s: 2 - (a.d - 1) * 0.6 });
    return m;
  });
  const phrase = toks.length > 1 ? ql.replace(/\s+/g, " ") : null;
  const need = toks.length <= 2 ? toks.length : Math.ceil(toks.length * 0.6);  // long queries: allow some misses
  const scored = [];
  for (let c = 0; c < lower.length; c++) {
    const t = lower[c];
    let score = 0, matched = 0;
    for (const mlist of matchers) {
      for (const m of mlist) {
        const at = t.indexOf(m.w);
        if (at >= 0) {
          let s = m.s;
          const before = at === 0 || !/[a-z0-9]/.test(t[at - 1]);
          const after = at + m.w.length >= t.length || !/[a-z0-9]/.test(t[at + m.w.length]);
          if (before && after) s += 1;               // whole-word hit
          score += s; matched++; break;
        }
      }
    }
    if (matched < need) continue;
    if (matched === toks.length) score += 2;
    if (phrase && t.includes(phrase)) score += 8;
    scored.push([score, c]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  // cap hits per video so one 6-hour stream doesn't flood the list; carry the SOURCE VIDEO on each hit
  const perVid = new Map(), hits = [], terms = [];
  for (const mlist of matchers) for (const m of mlist) terms.push(m.w);
  for (const [score, c] of scored) {
    const vi = chunkV[c], v = videos[vi];
    const nVid = (perVid.get(vi) || 0);
    if (nVid >= 3) continue;
    perVid.set(vi, nVid + 1);
    const [sec, text] = v.s[chunkI[c]];
    hits.push({ score, t: v.t, d: v.d, f: v.f, n: v.n, sec, text });
    if (hits.length >= 60) break;
  }
  postMessage({ type: "results", id, hits, terms, total: scored.length });
}
