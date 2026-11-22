function Install()
{//Observe delivery on either side of the automatic single-tab fast path.
  const observers=[],Base=Worker;
  window.ObserveMachineEvents=function (port,receive) {
    const observer={shared:false,receive};observers.push(observer);
    port.addEventListener("message",function (event) {
      if (event.data.cmd==="sharing") observer.shared=event.data.value;
      receive(event);
    });
  };
  window.Worker=class extends Base {
    constructor(...args) {
      super(...args);
      this.addEventListener("message",function (event) {
        if (["frame","windows","snd"].includes(event.data.cmd))
          for (const observer of observers)
            if (!observer.shared) observer.receive(event);
      });
    }
  };
}
export function MachineObserve(context,initialize,arg)
{
  return context.addInitScript({content:`(${Install.toString()})();(${initialize.toString()})(${JSON.stringify(arg)});`});
}
