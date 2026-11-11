import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn,execFileSync} from 'node:child_process';
import {root,FreedoomRead} from './Assets.mjs';

const backend=process.env.BACKEND||'worker';assert(['worker','qemu'].includes(backend));
assert(process.env[backend==='worker'?'TEMPLEOS_WEB':'HOLYC_WASM'],'Set the frozen runtime or native oracle path.');
const game=resolve(root,'games/Toom'),out=resolve(process.env.OUT||`/tmp/toom-startup-${Date.now()}`),
  copy=resolve(out,'source'),load=readFileSync(resolve(game,'Load.HC'),'latin1'),
  names=['Run.HC','Load.HC',...load.matchAll(/#include "([^"]+)"/g)]
    .map(n=>typeof n==='string'?n:n[1].includes('.')?n[1]:n[1]+'.HC')
    .concat(['TmOverlay.HC','TmScreen.HC','TmPlay.HC']),
  sources=new Map(names.map(n=>[n,readFileSync(resolve(game,n),'latin1')])),
  hash=s=>createHash('sha256').update(s).digest('hex'),
  sourceHashes=Object.fromEntries([...sources].map(([n,s])=>[n,hash(Buffer.from(s,'latin1'))])),labels=['entry'];
mkdirSync(copy,{recursive:true});
function mark(label){assert(labels.length<256);const n=labels.length;labels.push(label);return `TmStartupMark(${n});`;}
function after(file,needle,label) {
  const text=sources.get(file);assert.equal(text.split(needle).length-1,1,`${file}: ${needle}`);
  sources.set(file,text.replace(needle,needle+' '+mark(label)));
}
sources.set('Load.HC',load.replace(/#include "([^"]+)"/g,(all,name)=>all+'\n'+mark('compile '+name)));
let run=sources.get('Run.HC');
run=run.replace('#include "Load"',`F64 tm_start_times[256];\nU0 TmStartupMark(I64 n)\n{\n  if (!tm_start_times[n]) tm_start_times[n]=tS;\n}\nMemSet(tm_start_times,0,sizeof(tm_start_times));\nTmStartupMark(0);\n#include "Load"`);
run=run.replace(/#include "(TmOverlay|TmScreen|TmPlay)"/g,(all,name)=>all+'\n'+mark('compile '+name));
sources.set('Run.HC',run);
for(const [needle,label]of [
  ['if (!(tmpg->wad=WadNew(wad_name))) throw(\'Wad\');','WadNew'],
  ['if (!(tmpg->data=GameDataNew(data_name))) throw(\'Data\');','GameDataNew'],
  ['if (!(tmpg->graphics=GraphicsNew(tmpg->wad))) throw(\'Graphics\');','GraphicsNew'],
  ['if (!(tmpg->sprites=SpritesNew(tmpg->wad,tmpg->data))) throw(\'Sprites\');','SpritesNew'],
  ['if (!(tmpl->map=MapNew(tmpg->wad,name))) throw(\'Map\');','MapNew'],
  ['tmpl->world=WorldNew(tmpl->map,tmpg->data,tmpg->skill);','WorldNew'],
  ['WorldLoadThings(tmpl->world);','WorldLoadThings'],
  ['WeaponStart(tmpl->weapon); SpecialsInit(tmpl->specials);','level controllers'],
  ["throw('Surface');",'SurfacesNew'],["throw('View');",'ViewNew']
])after('TmLevel.HC',needle,label);
for(const [needle,label]of [
  ['Play *tmpp=CAlloc(sizeof(Play));','Play allocation'],
  ['tmpp->game=GameNew(wad_name,data_name,skill,fast);','GameNew complete'],
  ['tmpp->story=StoryNew(tmpp->game->wad);','StoryNew'],
  ['GameLoad(tmpp->game);','GameLoad complete'],
  ['tmpp->audio=AudioNew(tmpp->game->wad,tmpp->game->data);','AudioNew'],
  ['if (!tmpp->front || !tmpp->back) throw(\'DC\');','native frame buffers'],
  ['PlayFrame(tmpp);\n  } catch {\n    PlayDel(tmpp);','first frame'],
  ['Fs->draw_it=&PlayDrawIt;','native window ready']
]) {
  if(label==='first frame') {
    const text=sources.get('TmPlay.HC');assert.equal(text.split(needle).length-1,1);
    sources.set('TmPlay.HC',text.replace(needle,`PlayFrame(tmpp); ${mark(label)}\n  } catch {\n    PlayDel(tmpp);`));
  } else after('TmPlay.HC',needle,label);
}
for(const [name,text]of sources)writeFileSync(resolve(copy,name),Buffer.from(text,'latin1'));
copyFileSync(resolve(game,'TMDATA.BIN'),resolve(copy,'TMDATA.BIN'));
const meta={backend,sourceRevision:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sourceHashes,labels,
  scope:'Instrumented native tS attribution only. Markers change guest code addresses and JIT behavior; these samples are not uninstrumented performance acceptance.'},
  manifest=resolve(out,'marks.json');writeFileSync(manifest,JSON.stringify(meta,null,2)+'\n');
if(backend==='worker') {
  const child=spawn(process.execPath,[resolve(root,'tools/toom/worker.test.mjs')],{
    cwd:root,stdio:'inherit',env:{...process.env,OUT:out,GAME_DIR:copy,READY_ONLY:'1',STARTUP:manifest,CORES:process.env.CORES||'1'}});
  const code=await new Promise((done,reject)=>{child.on('error',reject);child.on('exit',done);});
  assert.equal(code,0,'Startup worker completed.');
} else {
  const filenames=new Map(names.map((n,i)=>[n,n==='Run.HC'?'BOOTTM.HC':`TM${String(i).padStart(3,'0')}.${n.endsWith('.HH')?'HH':'HC'}`]));
  const files=[...sources].map(([name,text])=>({name:filenames.get(name),bytes:Buffer.from(
    text.replace(/#include "([^"]+)"/g,(_,n)=>`#include "${filenames.get(n.includes('.')?n:n+'.HC')}"`)
      .replace(/\bToom;\s*$/,`Play *tm_start_play=PlayNew("FREEDOOM.WAD");
PlayDel(tm_start_play);
I64 tm_start_n;
for (tm_start_n=0;tm_start_n<${labels.length};tm_start_n++)
  "START %d %0.9f\\n",tm_start_n,tm_start_times[tm_start_n];
`),'latin1')}));
  files.push({name:'FREEDOOM.WAD',bytes:FreedoomRead()},{name:'TMDATA.BIN',bytes:readFileSync(resolve(game,'TMDATA.BIN'))});
  const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
  const result=await QemuRun([Buffer.from('ExeFile("C:/ORACLE/BOOTTM.HC");\n','latin1')],{files,timeout:180});
  assert.equal(result.results[0].except,'');assert.doesNotMatch(result.results[0].out,/WARNING/);
  const rows=[...result.results[0].out.matchAll(/START (\d+) (\d+\.\d+)/g)];assert.equal(rows.length,labels.length);
  const start=Number(rows[0][2]),marks=rows.map(r=>({label:labels[Number(r[1])],microseconds:Number(r[2])?Math.round((Number(r[2])-start)*1e6):null}));
  const output={...meta,...result,marks,fileHashes:Object.fromEntries(files.map(f=>[f.name,hash(f.bytes)])),
    nativeScope:'Original TempleOS compiles the private file package and runs PlayNew/PlayDel. It does not enter the interactive window or weapon-ready loop.'};
  writeFileSync(resolve(out,'native.json'),JSON.stringify(output,null,2)+'\n');
  console.log(JSON.stringify(output,null,2));
}
