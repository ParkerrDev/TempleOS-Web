// Copy as bytes: HolyC documents contain binary sprite records.
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {resolve,relative,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {syncLibrary} from './sync-game-library.mjs';
import {gameCredits} from '../game-credits.js';
import {ToomPackage} from './toom/Package.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const tinker=resolve(process.argv[2]||'../.work/upstream/TinkerOS');
const sha=b=>createHash('sha256').update(b).digest('hex');
const commit=d=>execFileSync('git',['-C',d,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
const revisions={tinker:commit(tinker)};
async function walk(dir){const out=[];for(const e of await readdir(dir,{withFileTypes:true})){if(e.name==='.git')continue;const p=resolve(dir,e.name);if(e.isDirectory())out.push(...await walk(p));else if(e.isFile())out.push(p);}return out.sort();}
const packages=[],hashes=[];
async function save(source,path,bytes){bytes??=await readFile(source);
 // Keep binary sprite records intact; normalize prohibited punctuation in UTF-8 text.
 if(!bytes.includes(0))try{const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);if(text.includes(String.fromCodePoint(8212)))bytes=Buffer.from(text.replaceAll(String.fromCodePoint(8212),'-'));}catch{}
const dest=resolve(root,'games/upstream',path);await mkdir(dirname(dest),{recursive:true});await writeFile(dest,bytes);const f={url:'games/upstream/'+path,bytes:bytes.length,sha256:sha(bytes)};hashes.push(f);return f;}
const gameDir=resolve(tinker,'Demo/Games');
for(const p of await walk(gameDir)){
 const rel=relative(gameDir,p).replaceAll('\\','/'),f=await save(p,'TinkerOS/'+rel);
 if(rel.endsWith('.HC')&&!rel.includes('/')){const name=rel.slice(0,-3);packages.push({id:'tinker-'+name,name,entry:'C:/Home/Games/TinkerOS/'+rel,files:[{...f,path:'C:/Home/Games/TinkerOS/'+rel}],upstream:'TinkerOS',revision:revisions.tinker});}
}
// TinkerOS added raw mouse APIs after the V5.03 guest snapshot. Keep its source
// intact and generate a separate, explicit compatibility entry for this game.
const castlePath=resolve(gameDir,'CastleFrankenstein.HC');
const castleOriginal=await readFile(castlePath);
const castleText=castleOriginal.toString('latin1');
for(const token of ['ms_hard.raw_bttns','ms_hard.raw_data.x'])if(castleText.split(token).length!==2)throw new Error('Review changed Castle mouse adapter: '+token);
const castleHeader=`// TempleOS V5.03 adapter for TinkerOS raw mouse input.\nI64 browser_mouse_x=ms_hard.pos.x;\nI64 BrowserMouseDX() {return ms_hard.pos.x-browser_mouse_x;}\nU0 MsRawRst() {browser_mouse_x=ms_hard.pos.x;}\nBool MsRaw(Bool enable=TRUE) {MsRawRst;return enable;}\n`;
const castleCompat=Buffer.from(castleHeader+castleText.replace('ms_hard.raw_bttns','ms_hard.bttns').replace('ms_hard.raw_data.x','BrowserMouseDX'),'latin1');
const castleFile=await save(null,'TinkerOS/BrowserCastle.HC',castleCompat);
const castle=packages.find(p=>p.name==='CastleFrankenstein');
castle.entry='C:/Home/Games/TinkerOS/BrowserCastle.HC';castle.files.push({...castleFile,path:castle.entry});
packages.push({id:'tinker-Stadium',name:'Stadium',entry:'C:/Home/Games/TinkerOS/Stadium/Stadium.HC',files:hashes.filter(f=>f.url.includes('/Stadium/')).map(f=>({...f,path:'C:/Home/Games/TinkerOS/'+f.url.split('/TinkerOS/')[1]})),upstream:'TinkerOS',revision:revisions.tinker});
await save(resolve(tinker,'LICENSE'),'TinkerOS/LICENSE');
// TOOM is this site's own HolyC game with Freedoom (tools/toom/Package.mjs).
packages.push(ToomPackage());
await syncLibrary({tinker,save,packages});
for(const pkg of packages)pkg.credit=gameCredits({name:pkg.name,packageId:pkg.id});
await writeFile(resolve(root,'games/catalog.json'),JSON.stringify({version:1,sources:{TinkerOS:{url:'https://github.com/tinkeros/TinkerOS',revision:revisions.tinker}},packages},null,2)+'\n');
console.log(`Imported ${packages.length} packages and ${hashes.length} files. TinkerOS ${revisions.tinker}.`);
