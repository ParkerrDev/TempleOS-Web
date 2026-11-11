import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {FreedoomRead,root} from './Assets.mjs';

export function SpeakerRenderSource(render=true,opt={}) {
  const game=resolve(opt.gameDir||process.env.GAME_DIR||resolve(root,'games/Toom')),read=n=>readFileSync(resolve(game,n),'latin1');
  let source=[...read('Load.HC').matchAll(/#include "([^"]+)"/g)]
    .map(m=>read(m[1].includes('.')?m[1]:m[1]+'.HC')).join('\n')+'\n'+
    ['TmOverlay.HC','TmScreen.HC','TmPlay.HC','TmSnd.HC'].map(read).join('\n')+'\n'+
    read('TmSpeaker.HC').replace('U0 SongTask(', 'extern I64 TmAudioTick(Speaker *tmps,I64 now);\n\nU0 SongTask(')
      .replace('SleepUntil(SpeakerTick(tmps,cnts.jiffies))','SleepUntil(TmAudioTick(tmps,cnts.jiffies))')+'\n'+
    readFileSync(new URL('SpeakerRender.HC',import.meta.url),'latin1').replace('TmAudioTest;',render?'TmAudioTest;':'TmAudioTest(FALSE);');
  const files=[{name:'FREEDOOM.WAD',bytes:FreedoomRead()},{name:'TMDATA.BIN',bytes:readFileSync(resolve(game,'TMDATA.BIN'))}];
  const yieldMs=opt.yieldMs??process.env.YIELD_MS;
  if(yieldMs) {
    const ms=Number(yieldMs);if(!Number.isInteger(ms)||ms<1||ms>1000)throw new Error('Invalid YIELD_MS');
    assert.equal(source.split('for (i=0;i<3;i++) PlayFrame(play);').length,2);
    source=source.replace('for (i=0;i<3;i++) PlayFrame(play);',`play->game->level->view->yield_mS=${ms};play->game->level->view->yield_jiffy=0;for (i=0;i<3;i++) PlayFrame(play);`);
  }
  return {source,files};
}
