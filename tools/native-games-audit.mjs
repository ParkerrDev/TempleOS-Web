import {readFile,writeFile} from 'node:fs/promises';
import {gameProject} from '../game-source.js';
import {compileNativeProject} from '../../holyc-wasm/native/project.js';
const root=new URL('../',import.meta.url);
globalThis.fetch=async url=>new Response(await readFile(new URL(url,root)));
globalThis.localStorage={getItem:()=>null};
const catalog=JSON.parse(await readFile(new URL('games/catalog.json',root)));
const games=[{name:'HolyCraft',file:'HolyCraft.HC'},{name:'Snake',file:'Snake.HC'},...catalog.packages.map(p=>({name:p.name,packageId:p.id}))];
const results=[];
for(const game of games){
  try{
    const result=compileNativeProject(await (await gameProject(game)).native());
    if(!WebAssembly.validate(result.bytes))throw new Error('Generated module failed WebAssembly validation.');
    results.push({name:game.name,compiled:true,bytes:result.bytes.length});
  }catch(error){results.push({name:game.name,compiled:false,error:error.message});}
}
if(process.argv[2])await writeFile(process.argv[2],JSON.stringify(results,null,2)+'\n');
for(const result of results)console.log(result.name+': '+(result.compiled?'compiled to WASM':result.error.split('\n')[0]));
console.log(`${results.filter(r=>r.compiled).length}/${results.length} compiled natively. This is a compatibility audit, not a gameplay test.`);
