// "Visitors" in the top bar: how many people have the site open right now, this one included.
// The page holds a WebSocket to the presence Worker (presence/Room.js), which sends the number of browsers
// connected whenever it changes. The id is random and kept in localStorage so that one person's tabs count
// once. Without a live connection the count reports null rather than an old number, and it never touches
// the OS. Keeping the socket up is livesocket.js.
import {createLiveSocket} from './livesocket.js';
import {ID,PONG} from './presence/RoomGlbls.js';

export const PRESENCE_URL='wss://templeosweb-presence.parkerrhunt.workers.dev/';
const ID_KEY='tos-presence-id';

export function browserId() {
  let id='';
  try{id=localStorage.getItem(ID_KEY)||'';}catch{}
  if(ID.test(id))return id;
  id=Array.from(crypto.getRandomValues(new Uint8Array(16)),(b)=>b.toString(16).padStart(2,'0')).join('');
  try{localStorage.setItem(ID_KEY,id);}catch{}
  return id;
}

export function createPresence(report,{url=PRESENCE_URL,id=browserId(),open}={}) {
  const socket=createLiveSocket(`${url}?id=${id}`,{
    open,
    lost:()=>report(null),
    message(data) {
      const people=Number(data);
      if(data!==PONG && Number.isSafeInteger(people) && people>0)report(people);
    },
  });
  return {wake:socket.wake};
}
