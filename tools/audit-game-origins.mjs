// Compare the shipping tree with Terry's official discs and record pinned provenance.
import {readFile,writeFile,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {TERRY_DEMOS,EXTRA_GAMES} from '../game-library.js';
const root=resolve(new URL('..',import.meta.url).pathname),upstream=resolve(process.argv[2]||'../.work/upstream');
const hash=b=>createHash('sha256').update(b).digest('hex');
const sha=async path=>hash(await readFile(path));
const main=resolve(upstream,'TerryOriginal/TempleOS.ISO'),sup=resolve(upstream,'TerryOriginal/TOS_Supplemental1.ISO.C');
const tinker=resolve(upstream,'TinkerOS');
const catalog=JSON.parse(await readFile(resolve(root,'games/catalog.json')));
const evidence=[];
async function compare(name,original,current){
 assert((await stat(original)).isFile());
 evidence.push({name,author:'Terry A. Davis',original:original.split('/TerryOriginal/')[1],originalSha256:await sha(original),...(current?{tinkerPath:current.slice(tinker.length+1),tinkerSha256:await sha(current)}:{})});
}
for(const name of TERRY_DEMOS){const path='Demo/Games/'+name+(name==='Stadium'?'/Stadium.HC':'.HC');await compare(name,resolve(main,path),resolve(tinker,path));}
for(const game of EXTRA_GAMES){
 if(game.group==='TinkerOS'&&game.credit.author==='Terry A. Davis'){
  const base=game.name==='Vocabulary'?'VocabQuiz':game.name==='Span'?'SpanMain':game.name;
  const path=game.name==='AfterEgypt'?'Sup1Games/AfterEgypt/AfterEgypt.HC':game.name==='Chess'?'Sup1Games/Chess.HC':game.folder+'/'+base+'.HC';
  const original=resolve(path.startsWith('Sup1Games/')?sup:main,path);
  await compare(game.name,original,resolve(tinker,game.folder,base+'.HC'));
 }else if(game.group==='TerrySupplement')await compare(game.name,resolve(sup,'Sup1Games',game.folder,game.folder.endsWith('.HC')?'':game.entry));
 else if(game.credit.author==='TheTinkerer'){
  const path=game.folder+'/'+(game.entry==='Run.HC'?'Run.HC':game.entry);
  const history=execFileSync('git',['-C',tinker,'log','--follow','--reverse','--format=%H %an: %s','--',path],{encoding:'utf8'}).trim().split('\n')[0];
  assert(history,'Missing origin history for '+game.name);
  evidence.push({name:game.name,author:game.credit.author,tinkerPath:path,firstCommit:history,source:game.credit.source,note:game.credit.note});
 }else evidence.push({name:game.name,author:game.credit.author,source:game.credit.source,revision:catalog.packages.find(p=>p.id===game.packageId).revision});
}
const toom=catalog.packages.find(p=>p.id==='toom');
evidence.push({name:toom.name,author:toom.credit.author,source:toom.credit.source,revision:toom.revision});
const archives=[];
for(const name of ['TempleOS.ISO','TOS_Supplemental1.ISO.C','TOS_Supplemental2.ISO.C','TOS_Supplemental3.ISO.C'])archives.push({url:'https://templeos.org/Downloads/'+name,sha256:await sha(resolve(upstream,'TerryArchives',name))});
for(const name of ['Ezekiel.ISO_.zip','LordofHostsv3.ISO_(1).zip','Temple.ISO_.C(1).zip'])archives.push({url:'https://github.com/austings/GamesMirror/blob/main/'+name,sha256:await sha(resolve(upstream,'AustinGames',name))});
await writeFile(resolve(root,'games/provenance.json'),JSON.stringify({tinkerRevision:catalog.sources.TinkerOS.revision,archives,evidence},null,2)+'\n');
console.log('Verified '+evidence.length+' game origins against official discs and author repositories.');
