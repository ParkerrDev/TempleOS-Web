export function GuestRequests(post)
{
  const pending=new Map();
  let next=1,guest=false,disk=false,failure="",diskFailure="";
  function finish(request,result) {
    pending.delete(request.id);
    clearTimeout(request.timeout);
    request.resolve(result);
  }
  function flush() {
    for (const request of pending.values()) {
      if (request.sent) continue;
      const msg=failure || (request.disk?diskFailure:"");
      if (msg) {
        finish(request,{id:request.id,ok:false,msg});
      } else if (guest && (!request.disk || disk)) {
        request.sent=true;
        try {post({...request.message,id:request.id},request.transfer);}
        catch (error) {finish(request,{id:request.id,ok:false,msg:String(error.message || error)});}
      }
    }
  }
  function cancel(msg) {
    for (const request of pending.values()) finish(request,{id:request.id,ok:false,msg});
  }
  function Fail(msg) {
    failure=String(msg);
    cancel(failure);
  }
  return {
    Request(message,transfer=[]) {
      return new Promise(resolve=>{
        const id=next++,request={id,message,transfer,resolve,sent:false,
          disk:message.cmd==='osWrite'||message.cmd==='osInstall'||
            message.cmd==='osLaunch'&&message.src===undefined};
        request.timeout=setTimeout(()=>finish(request,{id,ok:false,
          msg:"The OS request timed out. Check the guest before trying again."}),120000);
        pending.set(id,request);
        flush();
      });
    },
    Receive(message) {
      if (message.cmd==='fileResult') {
        const request=pending.get(message.id);
        if (request?.sent) finish(request,message);
      } else if (message.cmd==='guestReady') {
        guest=!!message.ok;
        if (!guest) Fail(message.probe?.errors?.join('; ') || "The TempleOS program interface could not start.");
        if (typeof message.diskReady==='boolean') {
          disk=message.diskReady;
          diskFailure=disk||message.diskPending?"":diskFailure || "This machine has no disk. Import a disk before opening files.";
        }
        flush();
      } else if (message.cmd==='diskInfo') {
        disk=message.diskReady===undefined?!!message.ok:!!message.diskReady;
        diskFailure=disk||message.diskPending?"":message.msg || "The TempleOS disk could not load.";
        flush();
      }
    },
    Reset(msg="OS restarted during the request.") {
      cancel(msg);
      guest=disk=false;failure=diskFailure="";
    },
    Fail,
  };
}
