// rules.js - what a chat message may be, shared by the Worker (chat/worker.js) and the page (chat.js), so
// both agree on the limits. Plain functions with no Cloudflare imports, so Node can test them
// (tools/chat.test.mjs).

export const MAX_TEXT = 300;      // characters (code points) in a message
export const MAX_NICK = 16;       // characters in a name
export const MAX_FRAME = 4096;    // characters of JSON a page may send at once; a full message is well under it
export const KEEP = 100;          // messages the room keeps, and sends to whoever joins
export const DEFAULT_NICK = "Guest";

// Bidi overrides and isolates can make a message display as something it does not say, and the line and
// paragraph separators break the one-line layout. Other format characters stay: emoji need U+200D and U+FE0F.
const HIDDEN = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069\u2028\u2029]/gu;
const CONTROL = /\p{Cc}/gu;
const MARKS = /(\p{M}{3})\p{M}+/gu;   // three combining marks are enough for any language; more is "Zalgo"
const SPACES = /\s+/gu;

function codePoints(s, max) {
  const out = [];
  for (const ch of s) { if (out.length >= max) break; out.push(ch); }
  return out.join("");
}

// One line, at most `max` characters, with nothing that hides what it says. Anything not a string is "".
export function cleanLine(value, max) {
  if (typeof value !== "string") return "";
  const s = value.slice(0, max * 8).normalize("NFC")   // the slice bounds the work done on a huge string
    .replace(CONTROL, " ").replace(HIDDEN, "").replace(MARKS, "$1").replace(SPACES, " ").trim();
  return codePoints(s, max).trim();
}

export const cleanText = (value) => cleanLine(value, MAX_TEXT);
export const cleanNick = (value) => cleanLine(value, MAX_NICK).replace(/[#@]/g, "").trim() || DEFAULT_NICK;

// The key a sender is rate limited by. IPv6 users usually hold a whole /64, so it is the first four groups.
export function ipKey(ip) {
  if (typeof ip !== "string" || !ip) return "?";
  if (!ip.includes(":")) return ip;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);   // an IPv4 address written as IPv6
  if (mapped) return mapped[1];
  const [head, tail] = ip.toLowerCase().split("::");
  const front = head ? head.split(":") : [];
  const back = tail === undefined ? [] : (tail ? tail.split(":") : []);
  const missing = Math.max(0, 8 - front.length - back.length);
  const groups = [...front, ...Array(tail === undefined ? 0 : missing).fill("0"), ...back];
  return groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":") + "::/64";
}

// Per sender: a burst of BURST messages, then one every REFILL_MS, and never the same text twice within
// REPEAT_MS. limit() takes what was kept about the sender (null for someone new) and gives back the verdict,
// null when the message may go out or else "slow" or "repeat", with what to keep now. It is a plain function
// over plain numbers because the room keeps them in its storage: a room that hibernates loses its memory.
export const BURST = 5, REFILL_MS = 3000, REPEAT_MS = 30000;
// A sender quiet this long is the same as someone new (the burst is full and the repeat window has passed),
// so what is kept about them can go.
export const FORGET_MS = 60000;

export function limit(kept, text, now) {
  const s = kept ? { ...kept } : { tokens: BURST, at: now, last: 0, lastAt: 0 };
  s.tokens = Math.min(BURST, s.tokens + Math.max(0, now - s.at) / REFILL_MS);
  s.at = Math.max(s.at, now);
  const last = textHash(text);
  if (s.tokens < 1) return { why: "slow", kept: s };
  if (last === s.last && now - s.lastAt < REPEAT_MS) return { why: "repeat", kept: s };
  s.tokens -= 1; s.last = last; s.lastAt = now;
  return { why: null, kept: s };
}

// 32-bit FNV-1a over the UTF-16 units: enough to notice a repeat without keeping what was said
export function textHash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}
