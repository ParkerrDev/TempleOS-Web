import {gameCatalog,gameFile} from './game-packages.js';

const projects=new Map();
const editable=path=>/\.(HC|HH)$/i.test(path);

// TempleOS documents are byte strings followed by optional binary sprite records.
// Keep the records outside the textarea and append them unchanged on export.
export function sourceDocument(buffer,utf8=false) {
  const bytes=new Uint8Array(buffer),zero=utf8?-1:bytes.indexOf(0);
  const end=zero<0?bytes.length:zero;
  let text='';
  if(utf8)text=new TextDecoder().decode(bytes);
  else for(let start=0;start<end;start+=8192)text+=String.fromCharCode(...bytes.subarray(start,Math.min(end,start+8192)));
  const original=text.replace(/\r\n?/g,'\n');
  return {
    original,hasSprites:zero>=0,
    encode(source) {
      if(source===original)return bytes.slice().buffer;
      if(source.includes('\0'))throw new Error('The source cannot contain a NUL character.');
      if(utf8)return new TextEncoder().encode(source).buffer;
      const prefix=new Uint8Array(source.length);
      for(let i=0;i<source.length;i++){
        const code=source.charCodeAt(i);
        if(code>255)throw new Error(`TempleOS source uses 8-bit characters. Replace ${JSON.stringify(source[i])} before running or saving.`);
        prefix[i]=code;
      }
      const output=new Uint8Array(prefix.length+bytes.length-end);
      output.set(prefix);output.set(bytes.subarray(end),prefix.length);
      return output.buffer;
    },
  };
}

export async function gameProject(game) {
  const id=game.packageId || game.file;
  if(!projects.has(id))projects.set(id,loadProject(game,id).catch(e=>{projects.delete(id);throw e;}));
  return projects.get(id);
}

async function loadProject(game,id) {
  let pkg;
  if(game.packageId){
    pkg=(await gameCatalog()).packages.find(p=>p.id===id);
    if(!pkg)throw new Error('Game package not found: '+id);
  }else pkg={name:game.name,entry:game.file,files:[{path:game.file,url:'games/'+game.file}]};
  const sources=pkg.files.filter(f=>editable(f.path));
  sources.sort((a,b)=>a.path===pkg.entry?-1:b.path===pkg.entry?1:a.path.localeCompare(b.path));
  const documents=new Map(),texts=new Map(),loads=new Map();
  const hashes=new Map(sources.map(file=>[file.path,file.sha256 || 'local']));
  const key=path=>'tos-game-source:'+id+':'+hashes.get(path)+':'+path;
  const saved=path=>{
    try{return localStorage.getItem(key(path)) ?? (!game.packageId?localStorage.getItem('tos-game:'+game.file):null);}
    catch{return null;}
  };
  async function open(path){
    const file=sources.find(f=>f.path===path);
    if(!file)throw new Error('Source file not in this game.');
    if(!loads.has(path))loads.set(path,(async()=>{
      let bytes;
      if(game.packageId)bytes=await gameFile(file);
      else{
        const response=await fetch(file.url,{cache:'no-cache'});
        if(!response.ok)throw new Error('Could not load '+file.url);
        bytes=await response.arrayBuffer();
      }
      documents.set(path,sourceDocument(bytes,!game.packageId));
      texts.set(path,saved(path) ?? documents.get(path).original);
    })().catch(e=>{loads.delete(path);throw e;}));
    await loads.get(path);
    return {text:texts.get(path),...documents.get(path)};
  }
  function change(path,text){
    if(!documents.has(path))throw new Error('Open the source before editing it.');
    texts.set(path,text);
    try{
      if(text===documents.get(path).original)localStorage.removeItem(key(path));
      else localStorage.setItem(key(path),text);
      if(!game.packageId)localStorage.removeItem('tos-game:'+game.file);
      return true;
    }catch{return false;}
  }
  return {
    id,name:game.name,entry:pkg.entry,sources,open,change,
    async reset(path){const doc=await open(path);change(path,doc.original);return doc.original;},
    async bytes(path){const doc=await open(path);return doc.encode(texts.get(path));},
    async overrides(){
      // Capture every draft before fetching any unopened source. Edits made while
      // the preview loads belong to the next run, including changes in other files.
      const drafts=sources.map(file=>({file,text:texts.has(file.path)?texts.get(file.path):saved(file.path)}));
      const result=new Map();
      for(const {file,text} of drafts){
        if(text===null)continue;
        const doc=await open(file.path);
        if(text!==doc.original)result.set(file.path,doc.encode(text));
      }
      return result;
    },
  };
}
