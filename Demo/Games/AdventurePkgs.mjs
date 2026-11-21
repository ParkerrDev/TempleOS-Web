import {createHash} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {gameCredits} from '../../Apps/Games/GameCredits.js';

const base=new URL('../../',import.meta.url);
export async function AdventurePackages(){
 const games=[
  {id:'after-davis',name:'After Davis',dir:'Upstream/AfterDavis',home:'AfterDavis',main:'AfterDavis.HC',
   revision:'29b4bf941c2ac74a451b3530f6e58090e6c14fb1'},
  {id:'kings-quest',name:"King's Quest",dir:'KingsQuest',home:'KingsQuest',main:'Run.HC'},
 ];
 const packages=[];
 for(const g of games){
  const prefix='Demo/Games/'+g.dir+'/',home='C:/Home/'+g.home+'/',files=[];
  const names=g.id==='after-davis'?[g.main,...(await readdir(new URL(prefix+'Art/',base))).sort().map(n=>'Art/'+n)]:
   [g.main,'Cpu.HC','Devices.HC'];
  for(const name of names){
   const url=prefix+name,b=await readFile(new URL(url,base));
   files.push({path:home+name,url,bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')});
  }
  packages.push({id:g.id,name:g.name,entry:home+g.main,revision:g.revision,files,
   credit:gameCredits({packageId:g.id,name:g.name})});
 }
 return packages;
}
