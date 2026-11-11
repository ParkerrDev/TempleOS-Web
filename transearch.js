import {QueryLoad,QueryEdit} from "./search/Query.js";

let videos = [];          // { t, d, f, n, s:[[sec,text],...] }
let chunk_video = [];          // chunk -> video index
let chunk_index = [];          // chunk -> index into video.s
let lower = [];           // chunk -> lowercase text
let vocab = new Map();    // word -> occurrence count
let vocab_len = [];      // word length -> [words]
let ready = false;

let load_task;
onmessage=async function (e) {
  const m=e.data,text=String(m.q || "");
  try {
    if (m.type=="load") {
      if (!load_task) load_task=CorpusLoad(m.base).finally(()=>load_task=null);
      await load_task;
    } else if (m.type=="query") Query(text,m.id,m,await QueryLoad());
    else if (m.type=="parse") {
      const Parse=await QueryLoad();
      postMessage({type:"parsed",id:m.id,text,parsed:Parse(text)});
    } else if (m.type=="edit") {
      const Parse=await QueryLoad();
      postMessage({type:"edited",id:m.id,text,value:QueryEdit(Parse,text,m.change)});
    } else if (m.type=="browse") Browse(m);
    else if (m.type=="video") {
      const v=videos[by_path.get(m.f)];
      postMessage({type:"video",id:m.id,video:v || null});
    }
  } catch (error) {
    postMessage({type:"error",phase:m.type,id:m.id,text,message:error.message || String(error)});
  }
};
const by_path = new Map();                        // archive path -> videos[] index

async function CorpusLoad(base) {
  ready=false;videos=[];chunk_video=[];chunk_index=[];lower=[];
  vocab=new Map();vocab_len=[];by_path.clear();date_order=null;
  const manifest=await fetch(base+"manifest.json");
  if (!manifest.ok) throw new Error("transcript manifest fetch "+manifest.status);
  const man=await manifest.json(),
    pending=man.shards.map(s=>fetch(base+s.f).then(response=>({response}),error=>({error})));
  for (let k = 0; k < man.shards.length; k++) {
    const result=await pending[k];
    if (result.error) throw result.error;
    const resp=result.response;
    if (!resp.ok) throw new Error("shard fetch " + resp.status);
    const arr = JSON.parse(await new Response(resp.body.pipeThrough(new DecompressionStream("gzip"))).text());
    for (const v of arr) {
      const vi = videos.length; videos.push(v); by_path.set(v.f, vi);
      for (let i = 0; i < v.s.length; i++) { chunk_video.push(vi); chunk_index.push(i); lower.push(v.s[i][1].toLowerCase()); }
    }
    postMessage({ type: "progress", loaded: k + 1, total: man.shards.length, videos: videos.length, chunks: lower.length });
  }
  for (const t of lower) for (const w of t.split(/[^a-z0-9']+/)) if (w.length >= 3 && w.length <= 24) vocab.set(w, (vocab.get(w) || 0) + 1);
  for (const w of vocab.keys()) { const L = w.length; (vocab_len[L] || (vocab_len[L] = [])).push(w); }
  ready = true;
  const years = [...new Set(videos.map((v) => v.d.slice(0, 4)).filter((y) => /^\d{4}$/.test(y)))].sort();
  postMessage({ type: "ready", videos: videos.length, chunks: lower.length, words: vocab.size, years });
}

function VideoInfo(vi) { const v = videos[vi];
  return { t: v.t, d: v.d, f: v.f, n: v.n, p: v.p, k: v.s.length, x: v.s[0] ? v.s[0][1].slice(0, 150) : "" }; }

let date_order = null;       // video indices sorted newest-first (date, then title)
function DateOrder() {
  if (!date_order) date_order = videos.map((_, i) => i).sort((a, b) => (videos[b].d + videos[b].t).localeCompare(videos[a].d + videos[a].t));
  return date_order;
}

function Browse(m) {
  if (!ready) { postMessage({ type: "browse", id: m.id, vids: [], total: 0, offset: 0 }); return; }
  let idx = DateOrder();
  if (m.sort === "old") idx = [...idx].reverse();

  const offset = m.offset || 0, limit = m.limit || 40;
  postMessage({ type: "browse", id: m.id, total: idx.length, offset, vids: idx.slice(offset, offset + limit).map(VideoInfo) });
}

function TextScore(t, matchers) {
  let score = 0, matched = 0;
  for (const mlist of matchers) {
    for (const m of mlist) {
      const at = t.indexOf(m.w);
      if (at >= 0) {
        let s = m.s;
        const before = at === 0 || !/[a-z0-9]/.test(t[at - 1]);
        const after = at + m.w.length >= t.length || !/[a-z0-9]/.test(t[at + m.w.length]);
        if (before && after) s += 1;
        score += s; matched++; break;
      }
    }
  }
  return [score, matched];
}

function WordDistance(a, b, maxEd) {
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

function WordAlternates(tok) {
  const out = [];
  if (tok.length < 4) return out;
  const maxEd = tok.length >= 8 ? 2 : 1;
  for (let L = tok.length - maxEd; L <= tok.length + maxEd; L++) {
    const bucket = vocab_len[L]; if (!bucket) continue;
    for (const w of bucket) {
      if (w === tok) continue;
      const d = WordDistance(tok, w, maxEd);
      if (d <= maxEd) out.push({ w, d, c: vocab.get(w) });
    }
  }
  out.sort((a, b) => a.d - b.d || b.c - a.c);
  return out.slice(0, 6);
}

function Query(q, id, opts, Parse) {
  const {scope,phrases,notPhrases,notWords,dateAny,dateFrom,dateTo,groups}=Parse(q);
  if (!ready) { postMessage({ type: "results", id, scope, hits: [], vids: [], note: "loading" }); return; }
  const sort = opts.sort || "rel";
  const toks = groups.map((g) => g[0]);
  const dateOk = (d) => (!dateAny.length || dateAny.some((p) => d.startsWith(p))) &&
    (!dateFrom || d.slice(0, dateFrom.length) >= dateFrom) &&
    (!dateTo || d.slice(0, dateTo.length) <= dateTo);
  const hasWord = (t, w) => { let i = 0;
    while ((i = t.indexOf(w, i)) >= 0) {
      const b = i === 0 || !/[a-z0-9]/.test(t[i - 1]), a = i + w.length >= t.length || !/[a-z0-9]/.test(t[i + w.length]);
      if (b && a) return true; i += 1; }
    return false; };
  const excluded = (t) => notWords.some((w) => hasWord(t, w)) || notPhrases.some((p) => t.includes(p));

  if (!toks.length && !phrases.length) {
    if (dateAny.length || dateFrom || dateTo) {
      let idx = DateOrder().filter((i) => dateOk(videos[i].d));
      if (sort === "old") idx = [...idx].reverse();
      postMessage({ type: "results", id, scope, hits: [], vids: idx.slice(0, 60).map(VideoInfo), vtotal: idx.length, terms: [], total: 0, dateOnly: true });
    } else postMessage({ type: "results", id, scope, hits: [], vids: [] });
    return;
  }

  const matchers = groups.map((g) => {
    const m = [];
    for (const tok of g) m.push({ w: tok, s: 3 });
    for (const tok of g) for (const a of WordAlternates(tok)) m.push({ w: a.w, s: 2 - (a.d - 1) * 0.6 });
    return m;
  });
  const terms = [...phrases];
  for (const mlist of matchers) for (const m of mlist) terms.push(m.w);
  const need = toks.length <= 2 ? toks.length : Math.ceil(toks.length * 0.6);
  const qualifies = (t) => {
    if (phrases.some((p) => !t.includes(p))) return -1;
    if (excluded(t)) return -1;
    const [score, matched] = TextScore(t, matchers);
    if (matched < need) return -1;
    return score + phrases.length * 8 + (toks.length && matched === toks.length ? 2 : 0);
  };

  let titleHits = [];
  if (scope !== "text") {
    const needT = toks.length ? Math.max(1, toks.length - (toks.length >= 3 ? 1 : 0)) : 0;
    for (let vi = 0; vi < videos.length; vi++) {
      const v = videos[vi];
      if (!dateOk(v.d)) continue;
      const t = v.t.toLowerCase();
      if (phrases.some((p) => !t.includes(p))) continue;
      if (excluded(t)) continue;
      const [score, matched] = TextScore(t, matchers);
      if (matched < needT) continue;
      if (!toks.length && !phrases.length) continue;
      titleHits.push([score + phrases.length * 8 + (toks.length && matched === toks.length ? 2 : 0), vi]);
    }
    if (sort === "new" || sort === "old") titleHits.sort((a, b) => { const c0 = sort === "new"
      ? videos[b[1]].d.localeCompare(videos[a[1]].d) : videos[a[1]].d.localeCompare(videos[b[1]].d); return c0 || b[0] - a[0]; });
    else titleHits.sort((a, b) => b[0] - a[0] || videos[b[1]].d.localeCompare(videos[a[1]].d));
  }
  const vtotal = titleHits.length;
  const vids = titleHits.slice(0, scope === "title" ? 60 : 5).map(([score, vi]) => VideoInfo(vi));
  if (scope === "title") { postMessage({ type: "results", id, scope, hits: [], vids, vtotal, terms, total: 0 }); return; }

  const scored = [];
  for (let c = 0; c < lower.length; c++) {
    if (!dateOk(videos[chunk_video[c]].d)) continue;
    const score = qualifies(lower[c]);
    if (score >= 0) scored.push([score, c]);
  }
  if (sort === "new" || sort === "old") scored.sort((a, b) => { const da = videos[chunk_video[a[1]]].d, db = videos[chunk_video[b[1]]].d;
    const c0 = sort === "new" ? db.localeCompare(da) : da.localeCompare(db); return c0 || b[0] - a[0]; });
  else scored.sort((a, b) => b[0] - a[0]);
  const perVid = new Map(), hits = [];
  for (const [score, c] of scored) {
    const vi = chunk_video[c], v = videos[vi];
    const nVid = (perVid.get(vi) || 0);
    if (nVid >= 3) continue;
    perVid.set(vi, nVid + 1);
    const [sec, text] = v.s[chunk_index[c]];
    hits.push({ score, t: v.t, d: v.d, f: v.f, n: v.n, p: v.p, sec, text });
    if (hits.length >= 60) break;
  }
  postMessage({ type: "results", id, scope, hits, vids: scope === "all" ? vids : [], vtotal: scope === "all" ? vtotal : 0, terms, total: scored.length });
}
