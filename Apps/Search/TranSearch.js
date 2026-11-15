import {QueryLoad,QueryEdit} from "./Query.js";

let videos=[],ready=false,load_task;
const by_path=new Map();

function VideoInfo(vi)
{
  const v=videos[vi];
  return {t:v.t,d:v.d,f:v.f,n:v.n,p:v.p,k:v.s.length,
    x:v.s[0]?v.s[0][1].slice(0,150):""};
}

async function CorpusLoad(base)
{
  ready=false;videos=[];by_path.clear();
  const manifest=await fetch(base+"manifest.json");
  if (!manifest.ok) throw new Error("transcript manifest fetch "+manifest.status);
  const man=await manifest.json(),
    pending=man.shards.map(s=>fetch(base+s.f).then(response=>({response}),error=>({error}))),
    Parse=await QueryLoad();
  let chunks=0;
  for (let k=0;k<man.shards.length;k++) {
    const result=await pending[k];
    if (result.error) throw result.error;
    const resp=result.response;
    if (!resp.ok) throw new Error("shard fetch "+resp.status);
    const arr=JSON.parse(await new Response(resp.body.pipeThrough(new DecompressionStream("gzip"))).text());
    for (const v of arr) {
      by_path.set(v.f,videos.length);videos.push(v);chunks+=v.s.length;
    }
    postMessage({type:"progress",loaded:k+1,total:man.shards.length,videos:videos.length,chunks});
  }
  const stats=Parse.load(videos),
    years=[...new Set(videos.map(v=>v.d.slice(0,4)).filter(y=>/^\d{4}$/.test(y)))].sort();
  ready=true;
  postMessage({type:"ready",videos:videos.length,...stats,years});
}

onmessage=async function (e) {
  const m=e.data,text=String(m.q || "");
  try {
    if (m.type=="load") {
      if (!load_task) load_task=CorpusLoad(m.base).finally(()=>load_task=null);
      await load_task;
    } else if (m.type=="video") {
      postMessage({type:"video",id:m.id,video:videos[by_path.get(m.f)] || null});
    } else {
      const Parse=await QueryLoad();
      if (m.type=="parse")
        postMessage({type:"parsed",id:m.id,text,parsed:Parse(text)});
      else if (m.type=="edit")
        postMessage({type:"edited",id:m.id,text,value:QueryEdit(Parse,text,m.change)});
      else if (m.type=="browse") {
        const offset=m.offset || 0,limit=m.limit || 40,vids=[];
        if (ready)
          for (let i=offset;i<Math.min(videos.length,offset+limit);i++)
            vids.push(VideoInfo(Parse.browse(i,m.sort=="old")));
        postMessage({type:"browse",id:m.id,vids,total:ready?videos.length:0,offset:ready?offset:0});
      } else if (m.type=="query") {
        if (!ready) {
          postMessage({type:"results",id:m.id,scope:Parse(text).scope,hits:[],vids:[],note:"loading"});
          return;
        }
        const result=Parse.run(text,m.sort);
        result.vids=result.vids.map(VideoInfo);
        result.hits=result.hits.map(([vi,index,score])=>{
          const v=videos[vi],[sec,text]=v.s[index];
          return {score,t:v.t,d:v.d,f:v.f,n:v.n,p:v.p,sec,text};
        });
        postMessage({type:"results",id:m.id,...result});
      }
    }
  } catch (error) {
    postMessage({type:"error",phase:m.type,id:m.id,text,message:error.message || String(error)});
  }
};
