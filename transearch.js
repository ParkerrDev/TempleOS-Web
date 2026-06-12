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
  else if (m.type === "query") query(String(m.q || ""), m.id, m);
  else if (m.type === "browse") browse(m);       // no query: list videos (sortable, year-filterable, paged)
  else if (m.type === "video") {                 // full transcript of one video (for the copy/transcript view)
    const v = videos[byPath.get(m.f)];
    postMessage({ type: "video", id: m.id, video: v || null });
  }
};
const byPath = new Map();                        // archive path -> videos[] index

async function load(base) {
  const man = await (await fetch(base + "manifest.json")).json();
  for (let k = 0; k < man.shards.length; k++) {
    const resp = await fetch(base + man.shards[k].f);
    if (!resp.ok) throw new Error("shard fetch " + resp.status);
    const arr = JSON.parse(await new Response(resp.body.pipeThrough(new DecompressionStream("gzip"))).text());
    for (const v of arr) {
      const vi = videos.length; videos.push(v); byPath.set(v.f, vi);
      for (let i = 0; i < v.s.length; i++) { chunkV.push(vi); chunkI.push(i); lower.push(v.s[i][1].toLowerCase()); }
    }
    postMessage({ type: "progress", loaded: k + 1, total: man.shards.length, videos: videos.length, chunks: lower.length });
  }
  for (const t of lower) for (const w of t.split(/[^a-z0-9']+/)) if (w.length >= 3 && w.length <= 24) vocab.set(w, (vocab.get(w) || 0) + 1);
  for (const w of vocab.keys()) { const L = w.length; (vocabByLen[L] || (vocabByLen[L] = [])).push(w); }
  ready = true;
  const years = [...new Set(videos.map((v) => v.d.slice(0, 4)).filter((y) => /^\d{4}$/.test(y)))].sort();
  postMessage({ type: "ready", videos: videos.length, chunks: lower.length, words: vocab.size, years });
}

// video list entry for browse / title-search results (no chunk payload — the teaser is enough)
function vmeta(vi) { const v = videos[vi];
  return { t: v.t, d: v.d, f: v.f, n: v.n, p: v.p, k: v.s.length, x: v.s[0] ? v.s[0][1].slice(0, 150) : "" }; }

let dateIdx = null;       // video indices sorted newest-first (date, then title)
function ensureDateIdx() {
  if (!dateIdx) dateIdx = videos.map((_, i) => i).sort((a, b) => (videos[b].d + videos[b].t).localeCompare(videos[a].d + videos[a].t));
  return dateIdx;
}

function browse(m) {
  if (!ready) { postMessage({ type: "browse", id: m.id, vids: [], total: 0, offset: 0 }); return; }
  let idx = ensureDateIdx();
  if (m.sort === "old") idx = [...idx].reverse();

  const offset = m.offset || 0, limit = m.limit || 40;
  postMessage({ type: "browse", id: m.id, total: idx.length, offset, vids: idx.slice(offset, offset + limit).map(vmeta) });
}

// score one lowercase string against the matchers; returns [score, matchedCount]
function scoreText(t, matchers) {
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
  return [score, matched];
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

function query(q, id, opts = {}) {
  if (!ready) { postMessage({ type: "results", id, hits: [], vids: [], note: "loading" }); return; }
  const scope = opts.scope || "all", sort = opts.sort || "rel";

  // ---- Twitter-style operator parsing ----------------------------------------------------------
  //   "exact phrase"   must contain it verbatim (case-insensitive, NO fuzzy)
  //   -word  -"..."    exclude chunks containing the word (boundary-checked) / phrase
  //   since:/until:    date range, each YYYY | YYYY-MM | YYYY-MM-DD (inclusive, prefix semantics)
  //   date:YYYY-MM-DD  exact date (also: a bare 19xx/20xx ISO date token acts as date:)
  //   plain words      fuzzy-matched as before
  const phrases = [], notPhrases = [], notWords = [], dateAny = [];
  let dateFrom = "", dateTo = "";
  let rest = q.toLowerCase()
    .replace(/(-?)"([^"]*)"/g, (m, neg, p) => { p = p.trim().replace(/\s+/g, " "); if (p) (neg ? notPhrases : phrases).push(p); return " "; })
    .replace(/(?:^|\s)(?:since|from|after):((?:19|20)\d{2}(?:-\d{2}(?:-\d{2})?)?)/g, (m, d) => { dateFrom = d; return " "; })
    .replace(/(?:^|\s)(?:until|to|before):((?:19|20)\d{2}(?:-\d{2}(?:-\d{2})?)?)/g, (m, d) => { dateTo = d; return " "; })
    .replace(/(?:^|\s)(?:date|on|year):((?:19|20)\d{2}(?:-\d{2}(?:-\d{2})?)?)/g, (m, d) => { dateAny.push(d); return " "; })
    .replace(/(^|\s)((?:19|20)\d{2}(?:-\d{2}(?:-\d{2})?)?)(?=\s|$)/g, (m, sp, d) => { dateAny.push(d); return sp; })
    .replace(/(^|\s)-([a-z0-9']+)/g, (m, sp, w) => { notWords.push(w); return sp; });
  let toks = rest.split(/[^a-z0-9']+/).filter((w) => w.length >= 2);
  if (opts.exact) {                                  // GUI exact mode: the typed text must appear VERBATIM (no fuzzy)
    const restNorm = rest.replace(/\s+/g, " ").trim();
    if (restNorm) phrases.push(restNorm);
    toks = [];
  }
  // multiple date:/bare dates UNION (any of them); since:/until: bound the range (inclusive prefixes)
  const dateOk = (d) => (!dateAny.length || dateAny.some((p) => d.startsWith(p))) &&
    (!dateFrom || d.slice(0, dateFrom.length) >= dateFrom) &&
    (!dateTo || d.slice(0, dateTo.length) <= dateTo);
  const hasWord = (t, w) => { let i = 0;
    while ((i = t.indexOf(w, i)) >= 0) {
      const b = i === 0 || !/[a-z0-9]/.test(t[i - 1]), a = i + w.length >= t.length || !/[a-z0-9]/.test(t[i + w.length]);
      if (b && a) return true; i += 1; }
    return false; };
  const excluded = (t) => notWords.some((w) => hasWord(t, w)) || notPhrases.some((p) => t.includes(p));

  // date-only query (no words, no phrases): LIST the videos in that range, like a filtered browse
  if (!toks.length && !phrases.length) {
    if (dateAny.length || dateFrom || dateTo) {
      let idx = ensureDateIdx().filter((i) => dateOk(videos[i].d));
      if (sort === "old") idx = [...idx].reverse();
      postMessage({ type: "results", id, hits: [], vids: idx.slice(0, 60).map(vmeta), vtotal: idx.length, terms: [], total: 0, dateOnly: true });
    } else postMessage({ type: "results", id, hits: [], vids: [] });
    return;
  }

  // matchers per fuzzy token: exact first, then bounded-edit-distance alternates from the vocab
  const matchers = toks.map((tok) => {
    const m = [{ w: tok, s: 3 }];
    for (const a of altsFor(tok)) m.push({ w: a.w, s: 2 - (a.d - 1) * 0.6 });
    return m;
  });
  const terms = [...phrases];
  for (const mlist of matchers) for (const m of mlist) terms.push(m.w);
  // a chunk/title qualifies if it has EVERY quoted phrase, NO excluded terms, and enough fuzzy tokens
  const need = toks.length <= 2 ? toks.length : Math.ceil(toks.length * 0.6);
  const qualifies = (t) => {
    if (phrases.some((p) => !t.includes(p))) return -1;
    if (excluded(t)) return -1;
    const [score, matched] = scoreText(t, matchers);
    if (matched < need) return -1;
    return score + phrases.length * 8 + (toks.length && matched === toks.length ? 2 : 0);
  };

  // ---- title search (scope all/title): whole videos --------------------------------------------
  let titleHits = [];
  if (scope !== "text") {
    const needT = toks.length ? Math.max(1, toks.length - (toks.length >= 3 ? 1 : 0)) : 0;
    for (let vi = 0; vi < videos.length; vi++) {
      const v = videos[vi];
      if (!dateOk(v.d)) continue;
      const t = v.t.toLowerCase();
      if (phrases.some((p) => !t.includes(p))) continue;
      if (excluded(t)) continue;
      const [score, matched] = scoreText(t, matchers);
      if (matched < needT) continue;
      if (!toks.length && !phrases.length) continue;
      titleHits.push([score + phrases.length * 8 + (toks.length && matched === toks.length ? 2 : 0), vi]);
    }
    if (sort === "new" || sort === "old") titleHits.sort((a, b) => { const c0 = sort === "new"
      ? videos[b[1]].d.localeCompare(videos[a[1]].d) : videos[a[1]].d.localeCompare(videos[b[1]].d); return c0 || b[0] - a[0]; });
    else titleHits.sort((a, b) => b[0] - a[0] || videos[b[1]].d.localeCompare(videos[a[1]].d));
  }
  const vtotal = titleHits.length;
  const vids = titleHits.slice(0, scope === "title" ? 60 : 5).map(([score, vi]) => vmeta(vi));
  if (scope === "title") { postMessage({ type: "results", id, hits: [], vids, vtotal, terms, total: 0 }); return; }

  // ---- passage search (scope all/text) ----------------------------------------------------------
  const scored = [];
  for (let c = 0; c < lower.length; c++) {
    if (!dateOk(videos[chunkV[c]].d)) continue;
    const score = qualifies(lower[c]);
    if (score >= 0) scored.push([score, c]);
  }
  if (sort === "new" || sort === "old") scored.sort((a, b) => { const da = videos[chunkV[a[1]]].d, db = videos[chunkV[b[1]]].d;
    const c0 = sort === "new" ? db.localeCompare(da) : da.localeCompare(db); return c0 || b[0] - a[0]; });
  else scored.sort((a, b) => b[0] - a[0]);
  // cap hits per video so one 6-hour stream doesn't flood the list; carry the SOURCE VIDEO on each hit
  const perVid = new Map(), hits = [];
  for (const [score, c] of scored) {
    const vi = chunkV[c], v = videos[vi];
    const nVid = (perVid.get(vi) || 0);
    if (nVid >= 3) continue;
    perVid.set(vi, nVid + 1);
    const [sec, text] = v.s[chunkI[c]];
    hits.push({ score, t: v.t, d: v.d, f: v.f, n: v.n, p: v.p, sec, text });
    if (hits.length >= 60) break;
  }
  postMessage({ type: "results", id, hits, vids: scope === "all" ? vids : [], vtotal: scope === "all" ? vtotal : 0, terms, total: scored.length });
}
