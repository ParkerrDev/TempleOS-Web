import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {FreedoomRead,root} from './Assets.mjs';

export function ModulePackage(modulePath,source=false) {
  const game=resolve(root,'games/Toom'),read=n=>readFileSync(resolve(game,n)),files=new Map(),
    run=read('RunBin.HC').toString('latin1');
  if(source) {
    files.set('Source.HC',read('Run.HC'));
    const names=['Load.HC',...[...read('Load.HC').toString('latin1').matchAll(/#include "([^"]+)"/g)]
      .map(m=>m[1].includes('.')?m[1]:m[1]+'.HC'),'TmOverlay.HC','TmScreen.HC','TmPlay.HC'];
    for(const name of names)files.set(name,read(name));
    assert(run.includes('Load(\\"Toom.BIN\\");'));
    files.set('Run.HC',Buffer.from(run.replace('Load(\\"Toom.BIN\\");','ExeFile(\\"Source.HC\\");'),'latin1'));
  } else {
    assert(modulePath,'Set MODULE to the native .BIN path.');
    files.set('Toom.BIN',readFileSync(modulePath));files.set('Run.HC',Buffer.from(run,'latin1'));
  }
  files.set('FREEDOOM.WAD',FreedoomRead());files.set('TMDATA.BIN',read('TMDATA.BIN'));
  return files;
}
