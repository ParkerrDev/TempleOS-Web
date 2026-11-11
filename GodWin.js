import {WinAdd,WinFocus} from "./WinMgr.js";
import {$,OsLaunch} from "./Os.js";
import {HelpGame} from "./HelpWin.js";

const CSS=`
#godWin { display:flex; flex-direction:column; gap:10px;
  width:min(680px,94vw); height:min(74dvh,620px); margin:0; padding:10px; }
#godOut { flex:1; min-height:0; overflow:auto; background:var(--blue);
  color:var(--white); padding:10px 12px; overflow-wrap:anywhere; }
#godOut .word { color:var(--yellow); margin-right:.6em; }
#godOut article { margin-bottom:14px; }
#godOut h3 { color:var(--ltgreen); font-size:12px; margin-bottom:8px; }
#godOut p { white-space:pre-wrap; line-height:1.3; }
#godBar { display:flex; gap:8px; flex-wrap:wrap; }
#godBar button { width:auto; min-height:32px; }
#godStatus { min-height:2.4em; line-height:1.2; }
#godNote { font-size:11px; line-height:1.3; }
`;
const HTML=`
<div id="godOverlay" class="overlay" role="dialog" aria-modal="true"
  aria-label="God Tools">
  <div class="win" id="godWin" data-title="God Tools">
    <span class="close" id="godClose">[X]</span>
    <div id="godOut" aria-label="Words and Bible passages"></div>
    <div id="godStatus" role="status"></div>
    <div id="godBar">
      <button id="godWord" data-action="word">Word</button>
      <button id="godPassage" data-action="passage">Passage</button>
      <button id="godSong" data-action="song">Song in TempleOS</button>
      <button id="godDoodle" data-action="doodle">Doodle in TempleOS</button>
      <button id="godClear">Clear</button>
    </div>
    <p id="godNote">Words and passages use the timing-bit order from
      Adam/God, seeded by the browser. Song and Doodle open Terry's original
      interactive programs on the OS screen.</p>
  </div>
</div>`;
WinAdd(CSS,HTML);

let ov=$("godOverlay"),out=$("godOut"),status=$("godStatus"),worker=null,
  pending=new Map,serial=0,generation=0;
const BUTTONS=document.querySelectorAll("#godBar [data-action]");

function Busy(on,text="")
{
  let b;
  for (b of BUTTONS)
    b.disabled=on;
  status.textContent=text;
  out.setAttribute("aria-busy",String(on));
}

function Failed(e)
{
  let p;
  for (p of pending.values())
    p.reject(new Error(e.message || "God Tools worker stopped. Try again."));
  pending.clear();
  worker.terminate();
  worker=null;
}

function Request(action)
{
  if (!worker) {
    worker=new Worker(new URL("./god/GodWorker.js",import.meta.url),
      {type:"module"});
    worker.onmessage=function (e) {
      let msg=e.data,p=pending.get(msg.id);
      if (p) {
        pending.delete(msg.id);
        if (msg.error)
          p.reject(new Error(msg.error));
        else
          p.resolve(msg.result);
      }
    };
    worker.onerror=Failed;
    worker.onmessageerror=Failed;
  }
  return new Promise(function (resolve,reject) {
    let id=++serial;
    pending.set(id,{resolve,reject});
    worker.postMessage({id,action,timing:Math.floor(performance.now()*1000)});
  });
}

function Append(result,action)
{
  let el=document.createElement("span"),title,body;
  if (action=="word") {
    el.className="word";
    el.textContent=result;
  } else {
    el=document.createElement("article");
    title=document.createElement("h3");
    title.textContent=result.ref;
    body=document.createElement("p");
    body.textContent=result.text;
    el.append(title,body);
  }
  out.append(el);
  while (out.childElementCount>80)
    out.firstElementChild.remove();
  out.scrollTop=out.scrollHeight;
}

async function Run(e)
{
  let action=e.currentTarget.dataset.action,gen=++generation,result,name,how,
    response,source;
  Busy(true,"Opening "+action+"...");
  try {
    if (action=="doodle" || action=="song") {
      name="God Song";
      if (action=="doodle")
        name="God Doodle";
      response=await fetch("./god/Tools.HC");
      if (!response.ok)
        throw new Error("Could not load the God Tools program. Try again.");
      source=await response.text();
      if (gen!=generation)
        return;
      result=await OsLaunch({name,src:source+"\nGodTool"+
        action[0].toUpperCase()+action.slice(1)+";"});
      if (!result?.ok)
        throw new Error(result?.msg || "TempleOS is not ready. Try again.");
      if (gen!=generation)
        return;
      how="Choose the song settings in TempleOS, then supply timing when prompted.";
      if (action=="doodle")
        how="Click OKAY in the prompt, then press Space until it finishes. "+
          "Esc then accepts; Shift+Esc discards. Accepted drawings are saved "+
          "as GodDoodle documents in C:/Home. Enter clears; 0-9 smooth.";
      HelpGame({name,how});
      Close();
      $("canvas").focus();
      WinFocus($("frame"));
    } else {
      result=await Request(action);
      if (gen==generation)
        Append(result,action);
    }
    if (gen==generation)
      Busy(false);
  } catch (error) {
    if (gen==generation)
      Busy(false,error.message);
  }
}

function Clear()
{
  generation++;
  out.replaceChildren();
  Busy(false);
}

function Close()
{
  generation++;
  ov.classList.remove("open","free");
  Busy(false);
}

export function Open()
{
  ov.classList.add("open");
  ov.setAttribute("aria-modal","true");
  WinFocus($("godWin"));
}

for (const b of BUTTONS)
  b.addEventListener("click",Run);
$("godClear").addEventListener("click",Clear);
$("godClose").addEventListener("click",Close);
ov.addEventListener("pointerdown",function (e) {
  if (e.target==ov)
    Close();
});
