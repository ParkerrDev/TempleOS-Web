// Copy as bytes: HolyC documents contain binary sprite records.
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {resolve,relative,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const tinker=resolve(process.argv[2]||'../.work/upstream/TinkerOS'),toom=resolve(process.argv[3]||'../.work/upstream/TOOM');
const sha=b=>createHash('sha256').update(b).digest('hex');
const commit=d=>execFileSync('git',['-C',d,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
const revisions={tinker:commit(tinker),toom:commit(toom)};
async function walk(dir){const out=[];for(const e of await readdir(dir,{withFileTypes:true})){if(e.name==='.git')continue;const p=resolve(dir,e.name);if(e.isDirectory())out.push(...await walk(p));else if(e.isFile())out.push(p);}return out.sort();}
const packages=[],hashes=[];
async function save(source,path,bytes){bytes??=await readFile(source);const dest=resolve(root,'games/upstream',path);await mkdir(dirname(dest),{recursive:true});await writeFile(dest,bytes);const f={url:'games/upstream/'+path,bytes:bytes.length,sha256:sha(bytes)};hashes.push(f);return f;}
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
const toomFiles=[];
for(const p of await walk(toom)){
 const rel=relative(toom,p).replaceAll('\\','/');
 if(rel==='doom1.wad'||rel==='freedoom1.wad'||/\.(png|gitignore)$/i.test(rel))continue;
 const f=await save(p,'TOOM/'+rel);toomFiles.push({...f,path:'C:/Home/TOOM/'+rel});
}
// The upstream melt transition copies two rows at a time but permits y==height,
// corrupting the allocation after the destination framebuffer on level entry.
// Preserve the downloaded source and install an explicit bounds-fixed adapter.
const meltOriginal=await readFile(resolve(toom,'ScreenMelt.HC'));
const meltToken='if(y>=2+to->height) break;';
if(meltOriginal.toString('latin1').split(meltToken).length!==2)throw new Error('Review changed TOOM melt bounds adapter');
const meltCompat=Buffer.from(meltOriginal.toString('latin1').replace(meltToken,'if(y>=to->height) break;'),'latin1');
const meltFile=await save(null,'TOOM/BrowserScreenMelt.HC',meltCompat);
const meltIndex=toomFiles.findIndex(f=>f.path==='C:/Home/TOOM/ScreenMelt.HC');
toomFiles[meltIndex]={...meltFile,path:'C:/Home/TOOM/ScreenMelt.HC'};
const drawerOriginal=await readFile(resolve(toom,'MainDrawer.HC'));
let drawerText=drawerOriginal.toString('latin1');
const plotToken='  x=GR_WIDTH-x;';
if(drawerText.split(plotToken).length!==2)throw new Error('Review changed TOOM sector bounds adapter');
drawerText=drawerText.replace(plotToken,'  x=GR_WIDTH-2-x;\n  if(x<0 || x+1>=dc->width || y<0 || y+1>=dc->height) return;');
const drawerFile=await save(null,'TOOM/BrowserMainDrawer.HC',Buffer.from(drawerText,'latin1'));
toomFiles[toomFiles.findIndex(f=>f.path==='C:/Home/TOOM/MainDrawer.HC')]={...drawerFile,path:'C:/Home/TOOM/MainDrawer.HC'};
const wad=await readFile(resolve(toom,'freedoom1.wad')),chunk=4*1024*1024;
for(let offset=0,index=0;offset<wad.length;offset+=chunk,index++){
 const rel=`Freedoom${String(index).padStart(2,'0')}.BIN`,f=await save(null,'TOOM/'+rel,wad.subarray(offset,offset+chunk));toomFiles.push({...f,path:'C:/Home/TOOM/'+rel});
}
const startup=`// Browser package entry. Build the Freedoom IWAD from bounded upload parts.\n#exe {Cd(__DIR__);}\nU0 PrepareFreedoom()\n{\n  U8 *all=MAlloc(${wad.length}), *part;\n  I64 i,n,offset=0;\n  U8 name[32];\n  for(i=0;i<${Math.ceil(wad.length/chunk)};i++) {\n    StrPrint(name,"Freedoom%02d.BIN",i);\n    part=FileRead(name,&n);\n    if (!part || n<=0 || n>${chunk} || offset+n>${wad.length}) { Free(part); Free(all); throw('Package'); }\n    MemCpy(all+offset,part,n); offset+=n; Free(part);\n  }\n  if(offset!=${wad.length}) { Free(all); throw('Package'); }\n  if(!FileWrite("freedoom1.wad",all,offset)) { Free(all); throw('Disk'); }\n  Free(all);\n}\nPrepareFreedoom;\nFramePtrAdd("USE_IWAD",StrNew("freedoom1.wad"));\n#include "SinglePlayer.HC";\n`;
const f=await save(null,'TOOM/BrowserStart.HC',Buffer.from(startup));toomFiles.push({...f,path:'C:/Home/TOOM/BrowserStart.HC'});
packages.push({id:'toom',name:'TOOM',entry:'C:/Home/TOOM/BrowserStart.HC',files:toomFiles,upstream:'Church-of-Templeos/TOOM',revision:revisions.toom,wad:{name:'Freedoom 0.12.1',sha256:sha(wad),bytes:wad.length}});
await writeFile(resolve(root,'games/catalog.json'),JSON.stringify({version:1,sources:{TinkerOS:{url:'https://github.com/tinkeros/TinkerOS',revision:revisions.tinker},TOOM:{url:'https://github.com/Church-of-Templeos/TOOM',revision:revisions.toom}},packages},null,2)+'\n');
console.log(`Imported ${packages.length} packages and ${hashes.length} files. TinkerOS ${revisions.tinker}, TOOM ${revisions.toom}.`);
