// Fetch game assets as bytes so embedded DolDoc sprite records survive unchanged.
let catalogPromise;
const installed = new Map();
const downloads = new Map();
export async function gameFile(file) {
  if (!downloads.has(file.url)) downloads.set(file.url, (async () => {
    if(!file.path.startsWith('C:/Home/')||file.path.includes('..')||!file.url.startsWith('games/upstream/')||file.url.includes('..'))throw new Error('Invalid game package path.');
    const r=await fetch(file.url,{cache:'no-cache'});
    if(!r.ok)throw new Error(`Could not read ${file.url} (${r.status}).`);
    const bytes=await r.arrayBuffer();
    if(bytes.byteLength!==file.bytes)throw new Error('Game file length mismatch: '+file.url);
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
    if(hash!==file.sha256)throw new Error('Game file checksum mismatch: '+file.url);
    return bytes;
  })().catch(e=>{downloads.delete(file.url);throw e;}));
  return (await downloads.get(file.url)).slice(0);
}
export async function gameCatalog() {
  if (!catalogPromise) catalogPromise=fetch('games/catalog.json',{cache:'no-cache'}).then(async r=>{
    if(!r.ok)throw new Error(`Game catalog could not load (${r.status}).`);
    const c=await r.json();if(c.version!==1||!Array.isArray(c.packages))throw new Error('Unsupported game catalog.');return c;
  }).catch(e=>{catalogPromise=null;throw e;});
  return catalogPromise;
}
export async function installGame(id,writeFile,onStatus=()=>{},overrides=new Map()) {
  const catalog=await gameCatalog(),pkg=catalog.packages.find(p=>p.id===id);
  if(!pkg)throw new Error('Game package not found: '+id);
  const generation = globalThis.__osGeneration || 0;
  const previous = installed.get(id);
  const fresh = previous?.generation !== generation;
  for(const path of overrides.keys())if(!pkg.files.some(f=>f.path===path&&/\.(HC|HH)$/i.test(path)))throw new Error('Edited file is not a game source: '+path);
  // Download and verify the complete package before making any guest filesystem changes.
  const files=[];
  for(let i=0;i<pkg.files.length;i++){
    const f=pkg.files[i];
    if (!fresh && !overrides.has(f.path) && !previous.edited.has(f.path)) continue;
    onStatus(`Downloading ${pkg.name}: ${i+1} / ${pkg.files.length}`);
    const original=await gameFile(f),bytes=overrides.get(f.path) || original;
    files.push({path:f.path,bytes});
  }
  if(files.length)installed.delete(id);
  for(let i=0;i<files.length;i++){
    if ((globalThis.__osGeneration || 0) !== generation) throw new Error("OS restarted during installation.");
    onStatus(`Installing ${pkg.name}: ${i+1} / ${files.length}`);
    const r=await writeFile(files[i].path,files[i].bytes);
    if(!r?.ok)throw new Error(r?.msg||'The OS could not install '+files[i].path);
  }
  installed.set(id,{generation,edited:new Set(overrides.keys())});
  return {path:pkg.entry,name:pkg.name};
}
