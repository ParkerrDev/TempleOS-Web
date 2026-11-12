//Corrections of TempleOS V5.03 bugs, compiled in a stock boot from its own
//installed sources and applied to RAM only. DocClip.HC clips document
//sprites; the host sets its entry jump between CPU runs. ACDblBuf.HC double
//buffers the AutoComplete window; the guest sets its jumps itself on core 0.
export const DOC_CLIP_PATCH="doc-sprite-clip-v1",AC_DBL_BUF_PATCH="ac-dbl-buf-v1",
  GUEST_PATCHES=[DOC_CLIP_PATCH,AC_DBL_BUF_PATCH];
const AC_DBL_BUF_NUM=4,JOB="TempleOS corrections";

function JumpCheck(gx,old,target)
{//PUSH RBP; MOV RBP,RSP stay, then a JMP past the new routine's copy of them.
  if(!old || !target)return false;
  const view=new DataView(gx.rdBytes(old,9).buffer);
  return view.getUint32(0,true)===0xEC8B4855 && view.getUint8(4)===0xE9 &&
    old+9+view.getInt32(5,true)===target+4;
}

function Ptr(gx,name,i=0)
{
  const addr=gx.varFind(name);
  return addr?gx.rd64(addr+i*8):0;
}

function Revision(gx,name)
{
  const addr=gx.varFind(name);
  return addr?gx.rd64(addr):0;
}

function ExceptText(gx,name)
{//A HolyC throw('ACVer') code as its characters. rd64 would round it.
  const addr=gx.varFind(name);
  return addr?String.fromCharCode(...gx.rdBytes(addr,8).filter(ch=>ch)):"";
}

export function GuestPatchCheck(gx,patches)
{//A restored session's RAM must hold each correction its metadata lists.
  if(patches?.includes(DOC_CLIP_PATCH) && (Revision(gx,"doc_clip_revision")!==1 ||
      !JumpCheck(gx,Ptr(gx,"doc_clip_old"),Ptr(gx,"doc_clip_new"))))
    throw new Error("Saved document patch metadata does not match guest code");
  if(patches?.includes(AC_DBL_BUF_PATCH)) {
    let ok=Revision(gx,"ac_dbl_buf_revision")===1;
    for(let i=0;ok && i<AC_DBL_BUF_NUM;i++)
      ok=JumpCheck(gx,Ptr(gx,"ac_dbl_buf_old",i),Ptr(gx,"ac_dbl_buf_new",i));
    if(!ok)throw new Error("Saved AutoComplete patch metadata does not match guest code");
  }
}

export function GuestPatchRun({guest,instance,lock,unlock,onState,canRun=()=>true,restored=null})
{//One guest job compiles both, then DocClip's entry is set between CPU runs.
  let state="pending",id=null,tries=0,patches=[],sources=null;
  const result={};
  if(restored) {state="restored";patches=restored.slice();GuestPatchCheck(guest(),restored);}
  function Progress(next) {
    state=next;
    onState({cmd:"guestPatch",patches:GUEST_PATCHES.slice(),state,ok:true,msg:""});
  }
  function Fail(patch,msg) {if(!result[patch])result[patch]=msg;}
  function Finish() {
    state="done";
    patches=GUEST_PATCHES.filter(p=>result[p]===true);
    for(const patch of [AC_DBL_BUF_PATCH,DOC_CLIP_PATCH]) {
      const msg=result[patch]===true?"":result[patch]||"not attempted";
      onState({cmd:"guestPatch",patch,state:msg?"failed":"installed",ok:!msg,msg});
    }
  }
  async function Load() {
    const got=await Promise.allSettled(["DocClip.HC","ACDblBuf.HC"].map(async name=>{
      const response=await fetch(new URL("./patches/"+name,import.meta.url));
      if(!response.ok)throw new Error(name+": HTTP "+response.status);
      return response.text();
    }));
    const [doc,ac]=got;
    if(doc.status==="rejected")Fail(DOC_CLIP_PATCH,"Document patch source: "+doc.reason.message);
    if(ac.status==="rejected")Fail(AC_DBL_BUF_PATCH,"AutoComplete patch source: "+ac.reason.message);
    sources={doc:doc.value??null,ac:ac.value??null};
  }
  function Build(gx) {
    let src="";
    //AutoComplete first, under its own catch, so either can go in alone.
    if(sources.ac!==null)src+=sources.ac+"\nACDblBufTry;\n";
    if(sources.doc!==null)src+=sources.doc+"\nDocClipBuild;\n";
    if(!src)return Finish();
    try {
      id=gx.exec({src,target:"adam",name:JOB});
      Progress("building");
    } catch(err) {
      Fail(AC_DBL_BUF_PATCH,err.message);Fail(DOC_CLIP_PATCH,err.message);Finish();
    }
  }
  function Built(gx,job) {
    if(sources.ac!==null) {
      if(Revision(gx,"ac_dbl_buf_revision")===1)result[AC_DBL_BUF_PATCH]=true;
      else {
        const code=ExceptText(gx,"ac_dbl_buf_except");
        Fail(AC_DBL_BUF_PATCH,"AutoComplete flicker correction was not applied: "+
          (code?"exception '"+code+"'":job.msg||job.state));
      }
    }
    if(sources.doc===null)return Finish();
    if(job.state==="done")return Progress("installing");
    Fail(DOC_CLIP_PATCH,"Document sprite correction was not applied: "+(job.msg||job.state));
    Finish();
  }
  function Install(gx,inst) {
    try {
      const old=Ptr(gx,"doc_clip_old"),target=Ptr(gx,"doc_clip_new"),
        revision=gx.varFind("doc_clip_revision");
      if(!old || !target || !revision || !inst.exports.GuestPatchJump)
        throw new Error("Document patch addresses or engine support are unavailable");
      if(++tries>300)throw new Error("Document patch could not stop all cores outside its entry");
      if(!lock())return;
      try {
        const res=Number(inst.exports.GuestPatchJump(BigInt(old),BigInt(target)));
        if(res<0)throw new Error("Document routine has an unknown native prologue");
        if(!res)return;
        gx.wr64(revision,1);
        result[DOC_CLIP_PATCH]=true;
      } finally {unlock();}
    } catch(err) {Fail(DOC_CLIP_PATCH,err.message);}
    Finish();
  }
  function Tick(diskReady) {
    const gx=guest(),inst=instance();
    if(state==="pending" && diskReady && gx?.ready) {
      Progress("loading");Load();
    }
    if(state==="loading" && sources && canRun())Build(gx);
    if(state==="building") {
      const job=gx.status(id);
      if(["done","failed","error"].includes(job?.state))Built(gx,job);
    }
    if(state==="installing")Install(gx,inst);
  }
  function Meta() {return patches.slice();}
  function Pending() {return ["loading","building","installing"].includes(state);}
  return {Tick,Meta,Pending};
}
