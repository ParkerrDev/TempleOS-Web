export function CaptureBarrier(ctrl,cores,active,clock=performance.now.bind(performance))
{//Each capture has its own generation. An old acknowledgement never counts.
  let seq=0,held=false;
  function Unlock()
  {
    if (held) {
      Atomics.store(ctrl,2,0);
      Atomics.notify(ctrl,2);
      held=false;
    }
  }
  function Lock()
  {
    if (!active())
      return true;
    seq=seq%0x7FFFFFFF+1;
    Atomics.store(ctrl,2,seq);
    held=true;
    const end=clock()+20;
    for (let core=1;core<cores;core++)
      while (Atomics.load(ctrl,4+core)!=seq) {
        const left=end-clock();
        if (left<=0 || Atomics.load(ctrl,1)) {
          Unlock();
          return false;
        }
        Atomics.wait(ctrl,4+core,Atomics.load(ctrl,4+core),left);
      }
    return true;
  }
  return {Lock,Unlock};
}

export function CaptureWait(ctrl,core)
{//An application core publishes its writes and waits for this capture.
  const seq=Atomics.load(ctrl,2);
  if (!seq)
    return false;
  Atomics.store(ctrl,4+core,seq);
  Atomics.notify(ctrl,4+core);
  while (Atomics.load(ctrl,2)==seq && !Atomics.load(ctrl,1))
    Atomics.wait(ctrl,2,seq,20);
  return true;
}
