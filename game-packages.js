// Fetch game assets as bytes so embedded DolDoc sprite records survive unchanged.
let catalogPromise;
const installed = new Map();
export async function gameCatalog() {
  if (!catalogPromise) catalogPromise=fetch('games/catalog.json',{cache:'no-cache'}).then(async r=>{
    if(!r.ok)throw new Error(`Game catalog could not load (${r.status}).`);
    const c=await r.json();if(c.version!==1||!Array.isArray(c.packages))throw new Error('Unsupported game catalog.');return c;
  }).catch(e=>{catalogPromise=null;throw e;});
  return catalogPromise;
}
export async function installGame(id,writeFile,onStatus=()=>{}) {
  const catalog=await gameCatalog(),pkg=catalog.packages.find(p=>p.id===id);
  if(!pkg)throw new Error('Game package not found: '+id);
  const generation = globalThis.__osGeneration || 0;
  if (installed.get(id) === generation) return {path:pkg.entry,name:pkg.name};
  // Download and verify the complete package before making any guest filesystem changes.
  const files=[];
  for(let i=0;i<pkg.files.length;i++){
    const f=pkg.files[i];
    if(!f.path.startsWith('C:/Home/')||f.path.includes('..')||!f.url.startsWith('games/upstream/')||f.url.includes('..'))throw new Error('Invalid game package path.');
    onStatus(`Downloading ${pkg.name}: ${i+1} / ${pkg.files.length}`);
    const r=await fetch(f.url,{cache:'no-cache'});if(!r.ok)throw new Error(`Could not read ${f.url} (${r.status}).`);
    const bytes=await r.arrayBuffer();
    if(bytes.byteLength!==f.bytes)throw new Error('Game file length mismatch: '+f.url);
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
    if(hash!==f.sha256)throw new Error('Game file checksum mismatch: '+f.url);
    files.push({path:f.path,bytes});
  }
  for(let i=0;i<files.length;i++){
    if ((globalThis.__osGeneration || 0) !== generation) throw new Error("OS restarted during installation.");
    onStatus(`Installing ${pkg.name}: ${i+1} / ${files.length}`);
    const r=await writeFile(files[i].path,files[i].bytes);
    if(!r?.ok)throw new Error(r?.msg||'The OS could not install '+files[i].path);
  }
  installed.set(id,generation);
  return {path:pkg.entry,name:pkg.name};
}
