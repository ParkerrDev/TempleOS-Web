//Corrections of TempleOS V5.03 bugs, compiled in a stock boot from the stock
//sources and applied to RAM only. DocClip.HC clips document sprites; the host
//sets its entry jump between CPU runs. ACDblBuf.HC double buffers the
//AutoComplete window; the guest sets its jumps itself on core 0.
//patches/V5.03 holds byte copies of the two stock files they rebuild. The
//guest checks a copy's size and hash as it checks its own installed file, so
//the job needs no disk. Core 0 does not preempt, and the compile would stop
//the desktop for most of a second: with four cores CPU 1 compiles, and with
//one the page still shows its loader. AutoComplete sleeps until they are in.
export const DOC_CLIP_PATCH="doc-sprite-clip-v1",AC_DBL_BUF_PATCH="ac-dbl-buf-v1",
  GUEST_PATCHES=[DOC_CLIP_PATCH,AC_DBL_BUF_PATCH],JOB="TempleOS corrections",
  JOB_HOLD=JOB+": AutoComplete waits",JOB_WAKE=JOB+": AutoComplete wakes";
const AC_DBL_BUF_NUM=4,JOB_SETH=JOB+": CPU 1",JOB_AC=JOB+": AutoComplete",
  FILES=["DocClip.HC","ACDblBuf.HC","V5.03/DocRecalc.HC","V5.03/ACTask.HC"];
//The stock routines hide the window to refill it, and each print yields, so
//the WinMgr draws frames with it missing or half full. Core 0 does not
//preempt, so AutoComplete is suspended only while it sleeps in its loop's
//Sleep, holding no lock, with its window shown. For a second at most.
export const AC_HOLD="CTask *guest_patch_ac=NULL;\n"+
  "U0 GuestPatchHold()\n{\n  I64 timeout_jiffy=cnts.jiffies+JIFFY_FREQ;\n"+
  "  while (cnts.jiffies<timeout_jiffy && TaskValidate(ac.task)) {\n"+
  "    if (Bt(&ac.task->display_flags,DISPLAYf_SHOW) &&\n"+
  "\t  Bt(&ac.task->task_flags,TASKf_IDLE) && ac.task->wake_jiffy>cnts.jiffies) {\n"+
  "      guest_patch_ac=ac.task;\n      Suspend(guest_patch_ac);\n      return;\n    }\n"+
  "    Yield;\n  }\n}\nGuestPatchHold;\n",
  AC_WAKE="if (guest_patch_ac) Suspend(guest_patch_ac,FALSE);\n";
let pendingFiles=null;

export function GuestPatchLoad()
{//Fetches the patches and the stock copies once, as early as a boot likes.
  pendingFiles??=Promise.allSettled(FILES.map(async name=>{
    const response=await fetch(new URL("./patches/"+name,import.meta.url));
    if(!response.ok)throw new Error(name+": HTTP "+response.status);
    return new Uint8Array(await response.arrayBuffer());
  }));
  return pendingFiles;
}

function Latin1(bytes)
{//One char a byte, as gx.exec writes them back.
  let res="";
  for(let i=0;i<bytes.length;i+=8192)
    res+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return res;
}

export function HolyCStr(bytes)
{//A HolyC string of exactly these bytes. $ and controls go as two hex digits.
  let res='"';
  for(const b of bytes) {
    if(b===0x5C)res+="\\\\";
    else if(b===0x22)res+='\\"';
    else if(b===0x0A)res+="\\n";
    else if(b===0x09)res+="\\t";
    else if(b<0x20 || b>=0x7F || b===0x24)res+="\\x"+b.toString(16).toUpperCase().padStart(2,"0");
    else res+=String.fromCharCode(b);
  }
  return res+'"';
}

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

function Flag(gx,name)
{//A HolyC Bool, one byte.
  const addr=gx.varFind(name);
  return addr?gx.rdBytes(addr,1)[0]:0;
}

function Bytes(text)
{//The bytes of a one char a byte string.
  return Uint8Array.from(text,ch=>ch.charCodeAt(0));
}

function AsideText(src)
{//CPU 1's Seth task compiles src into Adam's table, so the names are where
//core 0 and the host look for them, and its heap outlives any job.
  return "U0 GuestPatchAside(U8 *src)\n{\n  CHashTable *old=Fs->hash_table;\n"+
    "  Fs->hash_table=adam_task->hash_table;\n  try\n    ExePutS(src);\n"+
    "  catch {\n    guest_patch_except=Fs->except_ch;\n    Fs->catch_except=TRUE;\n  }\n"+
    "  Fs->hash_table=old;\n}\nGuestPatchAside("+HolyCStr(Bytes(src))+");\n";
}

export function GuestPatchRun({guest,instance,lock,unlock,onState,canRun=()=>true,restored=null,aside=()=>0})
{//One guest job compiles both, on CPU 1 if it runs, else on core 0. Core 0
//sets AutoComplete's jumps; DocClip's entry is set between CPU runs.
//aside() is 1 if other cores run, -1 if they will, 0 if there are none.
  let state="pending",id=null,tries=0,patches=[],sources=null,core=0,docOk=false,docWhy="",
    held=undefined;   //the AC_HOLD job's id, null once it needs no AC_WAKE
  const result={};
  if(restored) {state="restored";patches=restored.slice();GuestPatchCheck(guest(),restored);}
  function Progress(next) {
    state=next;
    onState({cmd:"guestPatch",patches:GUEST_PATCHES.slice(),state,ok:true,msg:"",core});
  }
  function Fail(patch,msg) {if(!result[patch])result[patch]=msg;}
  function Report() {
    state="done";
    patches=GUEST_PATCHES.filter(p=>result[p]===true);
    for(const patch of [AC_DBL_BUF_PATCH,DOC_CLIP_PATCH]) {
      const msg=result[patch]===true?"":result[patch]||"not attempted";
      onState({cmd:"guestPatch",patch,state:msg?"failed":"installed",ok:!msg,msg,core});
    }
  }
  function Hold(gx) {//AC_HOLD, queued first, so it runs before any correction job.
    try {held=gx.exec({src:AC_HOLD,target:"adam",name:JOB_HOLD,force:true,background:true});}
    catch(err) {held=null;}
  }
  function Finish() {//AC_WAKE: AutoComplete wakes, installed or not, before the results go out.
    if(held==null)return Report();
    held=null;
    try {
      id=guest().exec({src:AC_WAKE,target:"adam",name:JOB_WAKE,force:true,background:true});
      Progress("waking");
    } catch(err) {Report();}
  }
  async function Load() {
    const [doc,ac,docStock,acStock]=await GuestPatchLoad(),
      Value=got=>got.status==="fulfilled"?got.value:null;
    if(doc.status==="rejected")Fail(DOC_CLIP_PATCH,"Document patch source: "+doc.reason.message);
    if(ac.status==="rejected")Fail(AC_DBL_BUF_PATCH,"AutoComplete patch source: "+ac.reason.message);
    sources={doc:Value(doc),ac:Value(ac),docStock:Value(docStock),acStock:Value(acStock)};
  }
  function Stock(bytes) {return bytes?HolyCStr(bytes)+","+bytes.length:"";}
  function DiskNeed() {//A stock copy that did not load is read from the disk.
    return sources.ac && !sources.acStock || sources.doc && !sources.docStock;
  }
  function Text(ac_build) {//AutoComplete first, under its own catch, so either can go in alone.
    let src="";
    if(sources.ac)src+=Latin1(sources.ac)+"\n"+ac_build+"("+Stock(sources.acStock)+");\n";
    if(sources.doc)src+=Latin1(sources.doc)+"\nDocClipBuild("+Stock(sources.docStock)+");\n";
    return src;
  }
  function Exec(gx,src,target,name,next) {//Queued behind whatever the page asked
//for first, and never in the way of what it asks for next.
    try {
      id=gx.exec({src,target,name,force:true,background:true});
      Progress(next);
    } catch(err) {
      Fail(AC_DBL_BUF_PATCH,err.message);Fail(DOC_CLIP_PATCH,err.message);Finish();
    }
  }
  function Build(gx) {//Core 0 compiles and stops drawing until it is done.
    const src=Text("ACDblBufTry");
    core=0;
    if(!src)return Finish();
    Exec(gx,src,"adam",JOB,"building");
  }
  function Seek(gx) {//Where CPU 1's Seth task is. One line on core 0.
    Exec(gx,"I64 guest_patch_seth=0,guest_patch_except=0;\n"+
      "if (mp_cnt>1) guest_patch_seth=cpu_structs[1].seth_task;\n","adam",JOB_SETH,"seeking");
  }
  function Sought(gx,job) {
    const seth=job.state==="done"?Ptr(gx,"guest_patch_seth"):0,src=Text("ACDblBufBuildTry");
    if(!seth || !src)return Build(gx);
    core=1;
    Exec(gx,AsideText(src),seth,JOB,"building");
  }
  function AcResult(gx,job) {
    if(!sources.ac)return;
    if(Revision(gx,"ac_dbl_buf_revision")===1)result[AC_DBL_BUF_PATCH]=true;
    else {
      const code=ExceptText(gx,"ac_dbl_buf_except");
      Fail(AC_DBL_BUF_PATCH,"AutoComplete flicker correction was not applied: "+
        (code?"exception '"+code+"'":job.msg||job.state));
    }
  }
  function DocNext() {
    if(!sources.doc)return Finish();
    if(docOk)return Progress("installing");
    Fail(DOC_CLIP_PATCH,"Document sprite correction was not applied: "+docWhy);
    Finish();
  }
  function Built(gx,job) {
    if(!core) {
      docOk=job.state==="done";docWhy=job.msg||job.state;
      AcResult(gx,job);
      return DocNext();
    }
    if(job.state==="error")return Build(gx);   //CPU 1 did not take it.
    const code=ExceptText(gx,"guest_patch_except");
    docOk=job.state==="done" && !code && !!Ptr(gx,"doc_clip_new");
    docWhy=code?"exception '"+code+"'":job.state==="done"?"no routine was compiled":job.msg||job.state;
    if(sources.ac && Flag(gx,"ac_dbl_buf_built"))return Progress("fit");
    AcResult(gx,job);
    DocNext();
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
  function Done(gx) {
    const job=gx.status(id);
    return ["done","failed","error"].includes(job?.state)?job:null;
  }
  function Tick(diskReady) {
    const gx=guest(),inst=instance();
    let job;
    if(state==="pending" && gx?.ready) {
      Progress("loading");Load();
    }
    if(state==="loading" && held===undefined && canRun())Hold(gx);
    if(state==="loading" && sources && canRun() && (diskReady || !DiskNeed())) {
      const cores=aside();
      if(cores>0)Seek(gx);
      else if(!cores)Build(gx);
    }
    if(state==="seeking" && canRun() && (job=Done(gx)))Sought(gx,job);
    if(state==="building" && (job=Done(gx)))Built(gx,job);
    if(state==="fit" && canRun())Exec(gx,"ACDblBufTry;\n","adam",JOB_AC,"fitting");
    if(state==="fitting" && (job=Done(gx))) {
      AcResult(gx,job);
      DocNext();
    }
    if(state==="installing")Install(gx,inst);
    if(state==="waking" && Done(gx))Report();
  }
  function Meta() {return patches.slice();}
  function Pending() {//A save would keep AutoComplete asleep until "waking" ends.
    return ["loading","seeking","building","fit","fitting","installing","waking"].includes(state);
  }
  function Busy() {return state==="building" && !core;}   //the job holds core 0
  return {Tick,Meta,Pending,Busy};
}
