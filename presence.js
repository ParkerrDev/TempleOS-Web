// "With you" in the top bar: how many other people have the site open right now.
// The page holds a WebSocket to the presence Worker (presence/worker.js), which sends the number of browsers
// connected whenever it changes. That number includes this browser, so the bar shows one less. The id is
// random and kept in localStorage so that one person's tabs count once. Without a live connection the
// count reports null rather than an old number, and it never touches the OS.
export const PRESENCE_URL='wss://templeosweb-presence.parkerrhunt.workers.dev/';
const ID_KEY='tos-presence-id',ID=/^[0-9a-f]{32}$/;
const PING_MS=30000,SILENT_MS=95000,RETRY_MS=2000,RETRY_MAX_MS=60000;

export function browserId() {
  let id='';
  try{id=localStorage.getItem(ID_KEY)||'';}catch{}
  if(ID.test(id))return id;
  id=Array.from(crypto.getRandomValues(new Uint8Array(16)),(b)=>b.toString(16).padStart(2,'0')).join('');
  try{localStorage.setItem(ID_KEY,id);}catch{}
  return id;
}

export function createPresence(report,{url=PRESENCE_URL,id=browserId(),open=(u)=>new WebSocket(u)}={}) {
  let ws=null,ping=null,retry=null,delay=RETRY_MS,heard=0;
  function drop() {
    clearInterval(ping);clearTimeout(retry);
    if(!ws)return;
    ws.onmessage=ws.onclose=ws.onerror=null;
    try{ws.close();}catch{}
    ws=null;
  }
  function lost() {
    drop();
    report(null);
    retry=setTimeout(connect,delay*(1+Math.random()));   // spread out, so a Worker deploy brings no stampede
    delay=Math.min(delay*2,RETRY_MAX_MS);
  }
  function heardFrom(e) {
    heard=Date.now();
    delay=RETRY_MS;
    const people=Number(e.data);
    if(e.data!=='pong' && Number.isSafeInteger(people) && people>0)report(people-1);
  }
  function connect() {
    drop();
    try{ws=open(`${url}?id=${id}`);}catch{lost();return;}
    heard=Date.now();
    ws.onmessage=heardFrom;
    ws.onclose=ws.onerror=lost;
    // a sleeping laptop or a dead network can leave a socket that looks open and never closes
    ping=setInterval(()=>{
      if(Date.now()-heard>SILENT_MS)lost();
      else if(ws.readyState===1)ws.send('ping');
    },PING_MS);
  }
  return {wake(){if(!ws)connect();}};
}
