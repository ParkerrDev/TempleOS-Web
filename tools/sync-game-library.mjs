import {readFile,readdir,stat} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {execFileSync} from 'node:child_process';
import {EXTRA_GAMES} from '../game-library.js';
const commit=d=>execFileSync('git',['-C',d,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
async function walk(dir){const out=[];for(const e of await readdir(dir,{withFileTypes:true})){if(e.name==='.git')continue;const p=resolve(dir,e.name);if(e.isDirectory())out.push(...await walk(p));else if(e.isFile())out.push(p);}return out.sort();}
export async function syncLibrary({tinker,save,packages}) {
 const upstream=resolve(tinker,'..');
 const sources={TinkerOS:tinker,TerrySupplement:resolve(upstream,'TerryOriginal/TOS_Supplemental1.ISO.C/Sup1Games'),MarioClone:resolve(upstream,'MarioClone'),MaliciousTestimonies:resolve(upstream,'MaliciousTestimonies'),AustinArchive:resolve(upstream,'AustinSources')};
 const revisions={TinkerOS:commit(tinker),TerrySupplement:'TempleOS Supplemental 1, 2017-11-20',MarioClone:commit(sources.MarioClone),MaliciousTestimonies:commit(sources.MaliciousTestimonies),AustinArchive:commit(resolve(upstream,'AustinGames'))};
 const reviewed={MarioClone:'b9cc6b53aafc25f1930218e71ccee6ff8ecd4e6b',MaliciousTestimonies:'b74402c0c25403279ee5324c2bde77d142415a6d'};
 for(const [name,revision] of Object.entries(reviewed))if(revisions[name]!==revision)throw new Error('Review the '+name+' TempleOS adapters before importing revision '+revisions[name]);
 for(const game of EXTRA_GAMES){
  const source=resolve(sources[game.group],game.folder),single=(await stat(source)).isFile();
  const prefix=game.group+'/'+(game.folder==='.'?'':game.folder.replace(/\.HC$/,'')+'/');
  const guest='C:/Home/Games/'+prefix;
  const files=[];
  for(const path of single?[source]:await walk(source)){
   const rel=single?game.entry:relative(source,path).replaceAll('\\','/');
   if(/(^|\/)(\.gitignore|DoDistro.HC|MakeHome.HC|Registry.HC)$|\.bak$/i.test(rel))continue;
   if(game.name==='Ezekiel'&&rel!=='Sinner.HC')continue;
   const original=await readFile(path);
   const originalFile=await save(null,prefix+rel,original);
   let text=original.toString('latin1'),header='';
   if(game.name==='Castle Frankenstein 2'&&rel==='CF2.HC'){
    for(const token of ['ms_hard.raw_bttns','ms_hard.raw_data.x'])if(text.split(token).length!==2)throw new Error('Review CF2 raw mouse adapter: '+token);
    header='// TempleOS V5.03 raw mouse compatibility.\nI64 browser_mouse_x=ms_hard.pos.x;\nI64 BrowserMouseDX(){return ms_hard.pos.x-browser_mouse_x;}\nU0 MsRawRst(){browser_mouse_x=ms_hard.pos.x;}\nBool MsRaw(Bool enable=TRUE){MsRawRst;return enable;}\n';
    text=text.replace('ms_hard.raw_bttns','ms_hard.bttns').replace('ms_hard.raw_data.x','BrowserMouseDX');
   }
   if(game.name==='Lord of Hosts'&&rel==='Grid.HC')text=text.replaceAll('.HC.Z"','.HC"');
   if(game.name==="Solomon's Temple"&&rel==='cellar.HC')text=text.replace('C:/Home/Temple/Vocab.DD',guest+'Vocab.DD');
   if(game.name==='MarioClone'){
    if(rel==='Draw.HC'){
     text=text.replace('I64 startX = camX / TILE_SIZE;','I64 startX = MaxI64(0,camX / TILE_SIZE);').replace('I64 endX = (camX + SCREEN_W) / TILE_SIZE + 1;','I64 endX = MinI64(clvl->w,(camX + SCREEN_W) / TILE_SIZE + 1);');
    }
    if(rel==='Globals.HC'){
     // All particle loops visit 32 slots; upstream allocated only 16.
     text=text.replace('#define MAX_PARTICLES 16','#define MAX_PARTICLES 32');
     text=text.replace(' mario.x = 0;',' MemSet(&mario,0,sizeof(Mario));\n MemSet(coins,0,sizeof(coins));MemSet(mush,0,sizeof(mush));\n MemSet(goombas,0,sizeof(goombas));MemSet(brickParts,0,sizeof(brickParts));\n keyL=keyR=keyJump=jumpHeld=0;camX=jumpBuffer=grounded=0;\n mario.x = 0;');
    }
    if(rel==='Level.HC'){
     text=text.replace('U8 *lnptr = fptr;','if(!fptr)throw(\'File\');\n U8 *lnptr = fptr;');
     text=text.replace('lvl->tiles = MAlloc(lvl->w * lvl->h);','if(lvl->w<1||lvl->w>4096||lvl->h<1||lvl->h>256)throw(\'Level\');\n   lvl->tiles = CAlloc(lvl->w * lvl->h);');
     text=text.replace('if(mode == 1){','if(mode == 1 && y<lvl->h){');
     text=text.replace('clvl = LoadLevel("level1.txt");','Level *old=clvl;\n InitMario;\n clvl = LoadLevel("'+guest+'Levels/World1-1.TXT");\n Free(old->tiles);Free(old->tileState);Free(old->tileBounce);Free(old->tileBounceVel);Free(old);');
    }
   }
   if(game.name==='Malicious Testimonies'){
    if(rel==='RPG/Gameplay/Player.HC')text=text.replace('newPlayer->name ="Player";','StrCpy(newPlayer->name,"Player");').replace('DY'+String.fromCharCode(5)+'NG_STATUS','DYNG_STATUS');
    if(rel==='RPG/Graphics/Menu.HC')text=text.replace('p->name = "You";','StrCpy(p->name,"You");');
    // Aiwnios accepts prefix casts; TempleOS requires postfix casts.
    if(rel==='RPG/Data/Wad.HC')text=text.replace(/\(I64\)\(([^()]+)\)/g,'($1)(I64)');
    if(['RPG/Gameplay/Save.HC','RPG/Dev/Dev.HC'].includes(rel))text=text.replace('((U8)buffer)','buffer(U8)');
    if(rel==='RPG/Initialize.HC'){
     // Aiwnios networking is not available inside the offline TempleOS guest.
     text=text.replace(/^#include "Online\/[^"\n]+";[^\n]*$/gm,'');
    }
    if(rel==='RPG/RPG.HC')text=text.replace('Fs->animate_task = Spawn(&NetTask,NULL,"Network",,Fs);','// Offline TempleOS edition does not start an Aiwnios network task.');
    if(rel==='RPG/Graphics/Menu.HC')text=text.replace('mc->currentMenu = 6;','PopUpOk("Multiplayer requires the upstream Aiwnios version.\\nThis TempleOS edition runs offline.");');
   }
   let f=originalFile;
   if(header||text!==original.toString('latin1'))f=await save(null,prefix+'Browser/'+rel,Buffer.from(header+text,'latin1'));
   files.push({...f,path:guest+rel});
  }
  let header='// TempleOS-Web package entry. Upstream files retain their embedded sprites.\n#exe {Cd(__DIR__);}\n';
  if(game.name==='Malicious Testimonies')header+='// Networking types remain in the source data model; no network calls are made.\nclass CNetAddr {};\nU0 WritePacket(I64 socket,U8 *msg,Bool to_free=TRUE) {if(to_free)Free(msg);throw(\'Offline\');}\n';
  const f=await save(null,prefix+'BrowserStart.HC',Buffer.from(header+'Bool browser_auto_complete=AutoComplete(OFF);\n#include "'+game.entry+'";\nAutoComplete(browser_auto_complete);\n'));
  files.push({...f,path:game.disk});
  packages.push({id:game.packageId,name:game.name,entry:game.disk,files,upstream:game.group,revision:revisions[game.group],credit:game.credit});
 }
 return revisions;
}
