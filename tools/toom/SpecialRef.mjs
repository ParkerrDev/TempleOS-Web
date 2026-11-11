import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {root} from './Assets.mjs';

const dir=resolve(root,'tools/toom/source'),manifest=JSON.parse(readFileSync(resolve(dir,'collision.json')));
async function sourceRead(name) {
  const file=manifest.files.find(f=>f.path.split('/').pop()===name);assert(file,name);
  const path=resolve(dir,name);
  if(!existsSync(path)) {
    const response=await fetch(`https://raw.githubusercontent.com/id-Software/DOOM/${manifest.revision}/${file.path}`);
    assert(response.ok,`${name}: HTTP ${response.status}`);
    writeFileSync(path,Buffer.from(await response.arrayBuffer()));
  }
  const bytes=readFileSync(path);assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256,name);
  return bytes.toString('ascii').replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'');
}
function block(source,brace) {
  assert.equal(source[brace],'{');let depth=1,at=brace+1;
  for(;depth&&at<source.length;at++){if(source[at]==='{')depth++;if(source[at]==='}')depth--;}
  assert.equal(depth,0);return source.slice(brace+1,at-1);
}
function body(source,name) {
  const m=new RegExp(`\\b${name}\\s*\\([^)]*\\)\\s*\\{`).exec(source);assert(m,name);
  return block(source,m.index+m[0].length-1);
}
function switchBlocks(source,expression) {
  const regex=new RegExp(`switch\\s*\\(\\s*${expression}\\s*\\)\\s*\\{`,'g');
  return [...source.matchAll(regex)].map(m=>({index:m.index,body:block(source,m.index+m[0].length-1)}));
}
const labels=source=>[...source.matchAll(/\bcase\s+(\w+)\s*:/g)].map(m=>m[1]);
function cases(source) {
  const entries=[...source.matchAll(/\bcase\s+(\d+)\s*:/g)],result=new Map();let group=[];
  for(let i=0;i<entries.length;i++) {
    const m=entries[i],part=source.slice(m.index+m[0].length,entries[i+1]?.index??source.length).trim();
    group.push(Number(m[1]));if(!part)continue;
    const calls=[...part.matchAll(/\b(EV_\w+|P_ChangeSwitchTexture|G_(?:Secret)?ExitLevel)\s*\(([^()]*)\)/g)]
      .map(m=>({name:m[1],args:m[2].replace(/\s/g,'').split(',').filter(Boolean)}));
    assert(calls.length,`No action for ${group}`);
    const descriptor={calls,conditional:/if\s*\(\s*EV_/.test(part),
      monstersOnly:/if\s*\(\s*!thing->player\s*\)/.test(part),consume:/line->special\s*=\s*0/.test(part)};
    for(const n of group)result.set(n,descriptor);group=[];
  }
  assert.equal(group.length,0);return result;
}
export async function SpecialReference() {
  const [sw,spec]=await Promise.all([sourceRead('p_switch.c'),sourceRead('p_spec.c')]);
  const functions=[body(sw,'P_UseSpecialLine'),body(spec,'P_CrossSpecialLine'),body(spec,'P_ShootSpecialLine')];
  const events=functions.map(fn=>{
    const switches=switchBlocks(fn,'line->special'),last=switches.at(-1);assert(last);
    const prefix=fn.slice(0,last.index),monster=/if\s*\(\s*!thing->player\s*\)\s*\{/.exec(prefix);assert(monster);
    const gate=block(prefix,monster.index+monster[0].length-1),gateSwitch=switchBlocks(gate,'line->special');
    assert.equal(gateSwitch.length,1);
    return {cases:cases(last.body),monsters:labels(gateSwitch[0].body).map(Number),
      blockedTypes:switchBlocks(gate,'thing->type').flatMap(s=>labels(s.body))};
  });
  assert.deepEqual(events.map(e=>e.cases.size),[63,72,3]);
  assert.equal(events[0].blockedTypes.length,0);assert.equal(events[1].blockedTypes.length,6);
  const side=/if\s*\(\s*side\s*\)\s*\{/.exec(functions[0]);assert(side);
  const sideBody=block(functions[0],side.index+side[0].length-1);
  events[0].backSides=labels(switchBlocks(sideBody,'line->special')[0].body).map(Number);
  return {revision:manifest.revision,events};
}
