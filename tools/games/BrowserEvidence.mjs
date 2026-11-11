import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
export const root=new URL('../../',import.meta.url);
export const Hash=value=>createHash('sha256').update(value).digest('hex');
async function Files(dir){
 const files=[];
 for(const entry of await readdir(new URL(dir,root),{withFileTypes:true})){
  if(entry.isDirectory())files.push(...await Files(dir+entry.name+'/'));
  else if(entry.name.endsWith('.js'))files.push(dir+entry.name);
 }
 return files.sort();
}
async function Sources(paths){
 const hash=createHash('sha256');
 for(const path of paths){hash.update(path+'\0');hash.update(await readFile(new URL(path,root)));}
 return hash.digest('hex');
}
export async function CompilerInputs(){
 return Sources([...await Files('holyc-wasm/src/'),'editor/project.js']);
}
export async function BrowserInputs(){
 const shell=(await readdir(root)).filter(path=>path.endsWith(".js")).sort();
 return {
  compilerSha256:await CompilerInputs(),
  runnerSha256:await Sources([...await Files('editor/'),...shell,'index.html','tools/browser/games.mjs','tools/games/BrowserEvidence.mjs'])
 };
}
