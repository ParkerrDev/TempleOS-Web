let cancel=null;

export function PointerDrag(e,Move,End)
{//One captured pointer owns a border gesture until release or cancellation.
  let el=e.currentTarget,id=e.pointerId,win=el.ownerDocument.defaultView,
    done=false;
  function Finish()
  {
    if (done)
      return;
    done=true;
    el.removeEventListener("pointermove",Moved);
    el.removeEventListener("pointerup",Released);
    el.removeEventListener("pointercancel",Released);
    el.removeEventListener("lostpointercapture",Released);
    win.removeEventListener("blur",Finish);
    if (el.hasPointerCapture(id))
      el.releasePointerCapture(id);
    cancel=null;
    if (End)
      End();
  }
  function Moved(ev)
  {
    if (ev.pointerId==id)
      Move(ev);
  }
  function Released(ev)
  {
    if (ev.pointerId==id)
      Finish();
  }
  if (cancel)
    cancel();
  el.setPointerCapture(id);
  cancel=Finish;
  el.addEventListener("pointermove",Moved);
  el.addEventListener("pointerup",Released);
  el.addEventListener("pointercancel",Released);
  el.addEventListener("lostpointercapture",Released);
  win.addEventListener("blur",Finish);
  e.preventDefault();
}
