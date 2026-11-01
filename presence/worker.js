// worker.js - templeosweb-presence, the Cloudflare Worker behind "Visitors" in the site's top bar:
//   wss://templeosweb-presence.parkerrhunt.workers.dev/?id=<32 hex digits>
// Every open page holds one WebSocket here (presence.js). One Durable Object, the Room, keeps them all and
// tells each page how many browsers are connected whenever that changes. It uses the hibernation API, so it
// sleeps between joins and leaves with the sockets still open: the runtime answers pings without waking it,
// and someone sitting on the page costs nothing. The id only stops one person's tabs counting twice: it
// lives on the socket and goes with it, and nothing about a visitor is stored.
// It is apart from templeosweb-files so that nothing here can reach the disk image or the games.
//   deploy: cd presence && npx wrangler deploy
import { DurableObject } from "cloudflare:workers";

const ORIGINS = new Set(["https://templeosweb.netlify.app"]);
const ID = /^[0-9a-f]{32}$/;
const MAX_SOCKETS = 10000;   // the runtime allows 32,768, but every change goes to all of them
const STALE_MS = 150000;     // pages ping every 30 s, and a hidden tab's timers can slow to one a minute
const SWEEP_MS = 60000;
const fail = (status, text) => new Response(text, { status });

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  open() { return this.ctx.getWebSockets().filter((ws) => ws.readyState === WebSocket.OPEN); }

  // `joined` is a new socket: it needs the number even when the number has not changed (a second tab).
  // `said` is lost when the Room sleeps, which at worst sends everyone the number they already have.
  announce(joined) {
    const sockets = this.open();
    const people = String(new Set(sockets.map((ws) => ws.deserializeAttachment().id)).size);
    if (people === this.said) { joined?.send(people); return; }
    this.said = people;
    for (const ws of sockets) ws.send(people);
  }

  async fetch(req) {
    if (this.ctx.getWebSockets().length >= MAX_SOCKETS) return fail(503, "full");
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id: new URL(req.url).searchParams.get("id"), since: Date.now() });
    this.announce(server);
    if (await this.ctx.storage.getAlarm() === null) await this.ctx.storage.setAlarm(Date.now() + SWEEP_MS);
    return new Response(null, { status: 101, webSocket: client });
  }

  // Pages only ever send "ping", which the runtime answers before this could run.
  webSocketMessage(ws) { ws.close(1008, "pings only"); this.announce(); }
  webSocketClose() { this.announce(); }
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
}

export default {
  fetch(req, env) {
    if (!ORIGINS.has(req.headers.get("Origin"))) return fail(403, "forbidden");
    if (req.headers.get("Upgrade") !== "websocket") return fail(426, "expected a websocket");
    if (!ID.test(new URL(req.url).searchParams.get("id") ?? "")) return fail(400, "bad id");
    return env.ROOM.getByName("site").fetch(req);
  },
};
