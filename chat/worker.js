// worker.js - templeosweb-chat, the Cloudflare Worker behind the site's Chat window:
//   wss://templeosweb-chat.parkerrhunt.workers.dev/?id=<32 hex digits>
// A page opens one WebSocket here the first time someone opens Chat (chat.js). One Durable Object, the
// ChatRoom, holds every socket with the hibernation API, so an idle room costs nothing, and keeps the last
// KEEP messages in its SQLite storage so whoever joins sees what was said.
//
// What is stored: each message's time, name, text and tag. The tag is four hex digits of a hash of the
// browser's random id with a salt only this room knows, shown after the name so two people called "Guest"
// can be told apart; the id itself is never stored or shown. A sender's IP (or IPv6 /64) is never stored
// either: the room hashes it with the salt as the socket opens and rate limits by that hash, which it keeps
// on the socket while it is open and, in the sender table, until a minute after that sender's last message.
//
// Moderation: with the secret ADMIN_TOKEN set (npx wrangler secret put ADMIN_TOKEN), POST /admin with
// "Authorization: Bearer <token>" and one of {"list":true}, {"delete":<n>}, {"clear":true}. Without the
// secret, /admin does not exist.
//
// It is apart from templeosweb-presence so that the visitor count keeps storing nothing at all.
//   deploy: cd chat && npx wrangler deploy
import { DurableObject } from "cloudflare:workers";
import { cleanNick, cleanText, FORGET_MS, ipKey, KEEP, limit, MAX_FRAME } from "./rules.js";

const ID = /^[0-9a-f]{32}$/;
const MAX_SOCKETS = 5000;     // every message goes to all of them
const MAX_PER_SENDER = 8;     // sockets from one IP (or /64): tabs, not a flood
const STALE_MS = 150000;      // pages ping every 30 s, and a hidden tab's timers can slow to one a minute
const SWEEP_MS = 60000;
const fail = (status, text) => new Response(text, { status });
const hex = (bytes) => Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
const sha256 = (text) => crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));

export class ChatRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS msg (n INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL,
                   nick TEXT NOT NULL, tag TEXT NOT NULL, text TEXT NOT NULL)`);
    this.sql.exec("CREATE TABLE IF NOT EXISTS setting (k TEXT PRIMARY KEY, v TEXT NOT NULL)");
    // the rate limit, in storage because a hibernating room forgets everything held in memory
    this.sql.exec(`CREATE TABLE IF NOT EXISTS sender (k TEXT PRIMARY KEY, tokens REAL NOT NULL, at INTEGER NOT NULL,
                   last INTEGER NOT NULL, last_at INTEGER NOT NULL)`);
    this.salt = this.sql.exec("SELECT v FROM setting WHERE k = 'salt'").toArray()[0]?.v;
    if (!this.salt) {
      this.salt = hex(crypto.getRandomValues(new Uint8Array(16)));
      this.sql.exec("INSERT INTO setting (k, v) VALUES ('salt', ?)", this.salt);
    }
  }

  open() { return this.ctx.getWebSockets().filter((ws) => ws.readyState === WebSocket.OPEN); }
  people() { return new Set(this.open().map((ws) => ws.deserializeAttachment().id)).size; }
  log() { return this.sql.exec("SELECT n, at, nick, tag, text FROM msg ORDER BY n").toArray(); }
  send(ws, event) { try { ws.send(JSON.stringify(event)); } catch {} }
  broadcast(event) {
    const text = JSON.stringify(event);
    for (const ws of this.open()) { try { ws.send(text); } catch {} }
  }

  // `said` is lost when the room sleeps, which at worst sends everyone the number they already have
  announce() {
    const people = this.people();
    if (people === this.said) return;
    this.said = people;
    this.broadcast({ t: "people", n: people });
  }

  async fetch(req) {
    const id = new URL(req.url).searchParams.get("id");
    if (this.ctx.getWebSockets().length >= MAX_SOCKETS) return fail(503, "full");
    const sender = hex(await sha256(`${this.salt}:ip:${ipKey(req.headers.get("CF-Connecting-IP"))}`)).slice(0, 32);
    if (this.ctx.getWebSockets(sender).length >= MAX_PER_SENDER) return fail(429, "too many");
    const tag = hex(await sha256(`${this.salt}:${id}`)).slice(0, 4);
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server, [sender]);
    server.serializeAttachment({ id, tag, sender, since: Date.now() });
    this.send(server, { t: "hello", tag, people: this.people(), log: this.log() });
    this.announce();
    if (await this.ctx.storage.getAlarm() === null) await this.ctx.storage.setAlarm(Date.now() + SWEEP_MS);
    return new Response(null, { status: 101, webSocket: client });
  }

  // Pages send "ping", which the runtime answers before this could run, and {"t":"say","nick","text"}.
  webSocketMessage(ws, message) {
    if (typeof message !== "string" || message.length > MAX_FRAME) { ws.close(1009, "too big"); return; }
    let said = null;
    try { said = JSON.parse(message); } catch {}
    if (said?.t !== "say") { ws.close(1003, "say only"); return; }
    const text = cleanText(said.text);
    if (!text) { this.send(ws, { t: "err", why: "empty" }); return; }
    const me = ws.deserializeAttachment();
    const at = Date.now();
    if (this.refused(ws, me.sender, text, at)) return;
    const nick = cleanNick(said.nick);
    const { n } = this.sql.exec("INSERT INTO msg (at, nick, tag, text) VALUES (?, ?, ?, ?) RETURNING n",
      at, nick, me.tag, text).one();
    this.sql.exec("DELETE FROM msg WHERE n <= ?", n - KEEP);
    this.broadcast({ t: "msg", n, at, nick, tag: me.tag, text });
  }
  // the sender's rate limit, read and written with nothing in between, as SQL here does not wait
  refused(ws, sender, text, at) {
    this.sql.exec("DELETE FROM sender WHERE at < ?", at - FORGET_MS);
    const row = this.sql.exec("SELECT tokens, at, last, last_at AS lastAt FROM sender WHERE k = ?", sender).toArray()[0];
    const { why, kept } = limit(row ?? null, text, at);
    this.sql.exec("INSERT OR REPLACE INTO sender (k, tokens, at, last, last_at) VALUES (?, ?, ?, ?, ?)",
      sender, kept.tokens, kept.at, kept.last, kept.lastAt);
    if (why) this.send(ws, { t: "err", why });
    return why !== null;
  }
  // Close back: the runtime does not answer a page's close by itself, and the page would wait ten seconds
  // for a close that ends abnormally (tools/chat-worker.test.mjs times it).
  webSocketClose(ws) { try { ws.close(1000, "bye"); } catch {} this.announce(); }
  webSocketError() { this.announce(); }

  // A page that vanished (a laptop shut, a lost network) sends no close, so it stops pinging instead.
  // The sweep runs only while someone is connected.
  async alarm() {
    const now = Date.now();
    for (const ws of this.open()) {
      const heard = this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() ?? ws.deserializeAttachment().since;
      if (now - heard > STALE_MS) ws.close(1001, "silent");
    }
    this.announce();
    if (this.open().length) await this.ctx.storage.setAlarm(now + SWEEP_MS);
  }

  // moderation, called over RPC from /admin
  recent() { return this.log(); }
  remove(n) {
    const gone = this.sql.exec("DELETE FROM msg WHERE n = ? RETURNING n", n).toArray().length;
    if (gone) this.broadcast({ t: "del", n });
    return gone;
  }
  clear() { this.sql.exec("DELETE FROM msg"); this.broadcast({ t: "clear" }); }
}

// both sides hashed first, so the comparison takes the same time whatever was sent
async function sameSecret(given, secret) {
  const [a, b] = await Promise.all([sha256(given), sha256(secret)]);
  return crypto.subtle.timingSafeEqual(a, b);
}

async function admin(req, env, room) {
  if (!env.ADMIN_TOKEN) return fail(404, "not found");
  if (req.method !== "POST") return fail(405, "POST only");
  const given = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!(await sameSecret(given, env.ADMIN_TOKEN))) return fail(401, "wrong token");
  let op = null;
  try { op = await req.json(); } catch {}
  if (op?.list === true) return Response.json(await room.recent());
  if (op?.clear === true) { await room.clear(); return Response.json({ cleared: true }); }
  if (Number.isSafeInteger(op?.delete)) return Response.json({ deleted: await room.remove(op.delete) });
  return fail(400, 'send {"list":true}, {"delete":<n>} or {"clear":true}');
}

export default {
  fetch(req, env) {
    const url = new URL(req.url);
    const room = env.ROOM.getByName("site");
    if (url.pathname === "/admin") return admin(req, env, room);
    const origins = new Set(String(env.ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean));
    if (!origins.has(req.headers.get("Origin"))) return fail(403, "forbidden");
    if (req.headers.get("Upgrade") !== "websocket") return fail(426, "expected a websocket");
    if (!ID.test(url.searchParams.get("id") ?? "")) return fail(400, "bad id");
    return room.fetch(req);
  },
};
