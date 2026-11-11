export const DOC_CLIP_PATCH="doc-sprite-clip-v1";

export function DocClipPatch({guest,instance,lock,unlock,onState,canRun=()=>true,restored=null})
{//Compile the installed HolyC source, then patch its entry between CPU runs.
  let state="pending",id=null,tries=0,patches=[],source=null;
  if(restored) {state="restored";patches=restored.slice();}
  if(restored?.includes(DOC_CLIP_PATCH)) {
    const gx=guest(),revision=gx.varFind("doc_clip_revision"),
      old=gx.rd64(gx.varFind("doc_clip_old")),target=gx.rd64(gx.varFind("doc_clip_new")),
      view=new DataView(gx.rdBytes(old,9).buffer);
    if(!revision || !old || !target || gx.rd64(revision)!==1 ||
        view.getUint32(0,true)!==0xEC8B4855 ||
        view.getUint8(4)!==0xE9 ||
        old+9+view.getInt32(5,true)!==target+4)
      throw new Error("Saved document patch metadata does not match guest code");
  }
  function Report(next,msg="") {
    state=next;
    onState({cmd:"guestPatch",patch:DOC_CLIP_PATCH,state,ok:!msg,msg});
  }
  async function Build() {
    try {
      const response=await fetch(new URL("./patches/DocClip.HC",import.meta.url));
      if(!response.ok)throw new Error("Document patch source: HTTP "+response.status);
      source=await response.text();
    } catch(err) {Report("failed",err.message);}
  }
  function Tick(diskReady) {
    const gx=guest(),inst=instance();
    if(state==="pending" && diskReady && gx?.ready) {
      Report("loading");Build();
    }
    if(state==="loading" && source!==null && canRun()) {
      try {
        id=gx.exec({src:source+"\nDocClipBuild;",target:"adam",name:"Document sprite clipping"});
        source=null;Report("building");
      } catch(err) {Report("failed",err.message);}
    }
    if(state==="building") {
      const result=gx.status(id);
      if(result?.state==="done")Report("installing");
      else if(["failed","error"].includes(result?.state))
        Report("failed","Document sprite correction was not applied: "+(result.msg||result.state));
    }
    if(state!=="installing")return;
    try {
      const old=gx.rd64(gx.varFind("doc_clip_old")),target=gx.rd64(gx.varFind("doc_clip_new")),
        revision=gx.varFind("doc_clip_revision");
      if(!old || !target || !revision || !inst.exports.GuestPatchJump)
        throw new Error("Document patch addresses or engine support are unavailable");
      if(++tries>300)throw new Error("Document patch could not stop all cores outside its entry");
      if(!lock())return;
      try {
        const result=Number(inst.exports.GuestPatchJump(BigInt(old),BigInt(target)));
        if(result<0)throw new Error("Document routine has an unknown native prologue");
        if(!result)return;
        gx.wr64(revision,1);
        patches.push(DOC_CLIP_PATCH);
        Report("installed");
      } finally {unlock();}
    } catch(err) {Report("failed",err.message);}
  }
  function Meta() {return patches.slice();}
  function Pending() {return ["loading","building","installing"].includes(state);}
  return {Tick,Meta,Pending};
}
