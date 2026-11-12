//The toom entry of games/catalog.json: the game from games/Toom and Freedoom
//from games/upstream/Freedoom, installed into C:/Home/TOOM.
//  node tools/toom/Package.mjs --write	puts it into games/catalog.json
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {asset,root,version} from './Assets.mjs';
import {gameCredits} from '../../game-credits.js';

const GAME='games/Toom/',DIR='C:/Home/TOOM/';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

export function ToomReader(dir=resolve(root,GAME))
{//Reads one game file from dir as text.
  return name=>readFileSync(resolve(dir,name),'latin1');
}

export function ToomFile(name)
{//An include as Load.HC writes it, as a file name.
  return name.includes('.')?name:name+'.HC';
}

export function ToomIncludes(read=ToomReader())
{//What Load.HC includes, as it writes the names, in order.
  return [...read('Load.HC').matchAll(/#include "([^"]+)"/g)].map(m=>m[1]);
}

export function ToomText(keep=()=>true,read=ToomReader())
{//The text of the includes keep takes, in Load.HC's order, a newline between.
  return ToomIncludes(read).filter(keep).map(name=>read(ToomFile(name))).join('\n');
}

export function ToomSources(read=ToomReader())
{//Run.HC, Load.HC, what Load.HC includes and the window host, in order.
  return ['Run.HC','Load.HC',...ToomIncludes(read).map(ToomFile),
    'TmOverlay.HC','TmScreen.HC','TmPlay.HC'];
}

function PackageFile(url,name)
{
  const bytes=readFileSync(resolve(root,url));
  return {url,bytes:bytes.length,sha256:hash(bytes),path:DIR+name};
}

export function ToomPackage()
{//The sources, the state data, the native module build, and both licenses.
  const files=[...ToomSources(),'TMDATA.BIN','Build.HC','Native.HH','Toom.PRJ','RunBin.HC',
    'COPYING','NOTICE'].map(name=>PackageFile(GAME+name,name));
  files.push(PackageFile(asset.dir+'/freedoom1.wad','FREEDOOM.WAD'),
    PackageFile(asset.dir+'/COPYING.txt','Freedoom-COPYING.txt'),
    PackageFile(asset.dir+'/CREDITS.txt','Freedoom-CREDITS.txt'));
  assert.equal(files.find(f=>f.path===DIR+'FREEDOOM.WAD').sha256,asset.sha256);
  const pkg={id:'toom',name:'TOOM',entry:DIR+'Run.HC',files,
    wad:{name:'Freedoom '+version,sha256:asset.sha256,bytes:asset.bytes}};
  pkg.credit=gameCredits({name:pkg.name,packageId:pkg.id});
  return pkg;
}

if (process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const path=resolve(root,'games/catalog.json'),catalog=JSON.parse(readFileSync(path)),
    i=catalog.packages.findIndex(p=>p.id==='toom'),pkg=ToomPackage();
  assert(i>=0,'games/catalog.json has no toom entry.');
  if(process.argv[2]==='--write') {
    catalog.packages[i]=pkg;
    writeFileSync(path,JSON.stringify(catalog,null,2)+'\n');
    console.log(`TOOM: ${pkg.files.length} files written into games/catalog.json.`);
  } else {
    assert.deepEqual(catalog.packages[i],pkg,'Run node tools/toom/Package.mjs --write.');
    console.log(`TOOM: games/catalog.json matches its ${pkg.files.length} files.`);
  }
}
