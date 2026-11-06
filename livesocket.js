// A WebSocket that stays up: what "Visitors" (presence.js) and Chat (chat.js) both hold to their Workers.
// It pings every 30 s, which the Workers answer without waking (setWebSocketAutoResponse), replaces a socket
// that has gone silent, and after a loss retries further apart each time, up to a minute. Nothing connects
// until wake(), and wake() on a page coming back retries at once.
const PING_MS=30000,SILENT_MS=95000,RETRY_MS=2000,RETRY_MAX_MS=60000;

export function createLiveSocket(url,{message,lost,open=(u)=>new WebSocket(u)}) {
  let ws=null,ping=null,retry=null,delay=RETRY_MS,heard=0;
  function drop() {
    clearInterval(ping);clearTimeout(retry);
    if(!ws)return;
    ws.onmessage=ws.onclose=ws.onerror=null;
    try{ws.close();}catch{}
    ws=null;
  }
  function lose() {
    drop();
    lost();
    retry=setTimeout(connect,delay*(1+Math.random()));   // spread out, so a Worker deploy brings no stampede
    delay=Math.min(delay*2,RETRY_MAX_MS);
  }
  function heardFrom(e) {
    heard=Date.now();
    delay=RETRY_MS;
    message(e.data);
  }
  function connect() {
    drop();
    try{ws=open(url);}catch{lose();return;}
    heard=Date.now();
    ws.onmessage=heardFrom;
    ws.onclose=ws.onerror=lose;
    // a sleeping laptop or a dead network can leave a socket that looks open and never closes
    ping=setInterval(()=>{
      if(Date.now()-heard>SILENT_MS)lose();
      else if(ws.readyState===1)ws.send('ping');
    },PING_MS);
  }
  return {
    wake(){if(!ws)connect();},
    // false when there is no open socket to send on, so the caller can say so
    send(text){
      if(!ws||ws.readyState!==1)return false;
      try{ws.send(text);return true;}catch{return false;}
    },
  };
}
