import {createHash} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {gameCredits} from '../../Apps/Games/GameCredits.js';

const base=new URL('../../',import.meta.url);

async function Sources(dir)
{
  const names=[];
  for (const entry of await readdir(dir,{withFileTypes:true})) {
    if (entry.isFile() && /\.HC$/.test(entry.name)) names.push(entry.name);
    if (entry.isDirectory() && entry.name=='Data')
      for (const name of await readdir(new URL('Data/',dir)))
        if (name.endsWith('.BIN')) names.push('Data/'+name);
  }
  return names.sort();
}

export async function AdventurePackages()
{
  const games=[
    {id:'kings-quest',name:"King's Quest",dir:'KingsQuest',
      home:'KingsQuest',main:'Run.HC'},
  ],packages=[];
  for (const g of games) {
    const prefix='Demo/Games/'+g.dir+'/',home='C:/Home/'+g.home+'/',files=[];
    for (const name of await Sources(new URL(prefix,base))) {
      const url=prefix+name,bytes=await readFile(new URL(url,base));
      files.push({path:home+name,url,bytes:bytes.length,
        sha256:createHash('sha256').update(bytes).digest('hex')});
    }
    packages.push({id:g.id,name:g.name,entry:home+g.main,files,
      credit:gameCredits({packageId:g.id,name:g.name})});
  }
  return packages;
}
