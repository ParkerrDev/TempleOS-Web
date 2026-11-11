//What the two rooms (Room.js and chat/ChatRoom.js) and the pages that join
//them agree on. It imports nothing, so the page can import it too.

//A page joins with its browser id: 16 random bytes in hex.
export const ID=/^[0-9a-f]{32}$/;

//A page sends PING every PING_MS, and the runtime answers PONG without
//waking the room (setWebSocketAutoResponse).
export const PING="ping";
export const PONG="pong";
export const PING_MS=30000;

//A room closes a socket it has not heard a PING on for STALE_MS. A hidden
//tab's timers can slow to one a minute.
export const STALE_MS=150000;
