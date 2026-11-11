import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {FreedoomRead,root,version,wadHash} from './Assets.mjs';
import {WadRead} from './Wad.mjs';

const dir=resolve(root,'tools/toom/source'),out=resolve(root,'games/Toom');
const manifest=JSON.parse(readFileSync(resolve(dir,'source.json'))),sources={};
const put=(name,value)=>{
  const bytes=Buffer.from(value),path=resolve(out,name);
  if (process.argv.includes('--check'))assert.deepEqual(readFileSync(path),bytes,name);
  else writeFileSync(path,bytes);
};
for (const file of manifest.files) {
  const name=file.path.split('/').pop(),path=resolve(dir,name);
  if (!existsSync(path)) {
    const url=`https://raw.githubusercontent.com/id-Software/DOOM/${manifest.revision}/${file.path}`;
    const response=await fetch(url);assert(response.ok,`${response.status} ${url}`);
    writeFileSync(path,Buffer.from(await response.arrayBuffer()));
  }
  const bytes=readFileSync(path);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256,file.path);
  sources[name]=bytes.toString('ascii');
}
const clean=s=>s.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'');
const constants=new Map([['FRACUNIT',65536],['NULL',0]]);
function expression(source) {
  const atom=s=>{
    s=s.trim();
    if (/^-?(?:0[xX][\da-fA-F]+|\d+)$/.test(s))return Number(s);
    assert(constants.has(s),`Unknown constant ${s}`);
    return constants.get(s);
  };
  return source.trim().split('|').reduce((value,part)=>
    value|part.split('*').reduce((a,b)=>a*atom(b),1),0);
}
for (const file of ['info.h','sounds.h','p_mobj.h']) {
  for (const match of clean(sources[file]).matchAll(/typedef\s+enum\s*\{([^}]+)\}/g)) {
    let value=0;
    for (const item of match[1].split(',').map(s=>s.trim()).filter(Boolean)) {
      const fields=item.split('='),name=fields[0].trim();
      if (fields.length===2)value=expression(fields[1]);
      assert(/^[A-Za-z_]\w*$/.test(name),name);
      constants.set(name,value++);
    }
  }
}
const info=clean(sources['info.c']);
const sprites=[...info.match(/sprnames\[NUMSPRITES\]\s*=\s*\{([\s\S]*?)\};/)[1]
  .matchAll(/"([A-Z0-9]{4})"/g)].map(m=>m[1]);
assert.equal(sprites.length,constants.get('NUMSPRITES'));
const actions=['NULL'],states=[];
const body=info.match(/states\[NUMSTATES\]\s*=\s*\{([\s\S]*?)\};/)[1];
for (const m of body.matchAll(/\{([^{}]+),\{(\w+)\},([^{}]+)\}/g)) {
  let action=actions.indexOf(m[2]);
  if (action<0) {action=actions.length;actions.push(m[2]);}
  states.push([...m[1].split(',').map(expression),action,...m[3].split(',').map(expression)]);
}
assert.equal(states.length,constants.get('NUMSTATES'));
assert(states.every(s=>s.length===7&&s[0]>=0&&s[0]<sprites.length&&s[4]>=0&&s[4]<states.length));
const actors=[...info.match(/mobjinfo\[NUMMOBJTYPES\]\s*=\s*\{([\s\S]*?)\};/)[1]
  .matchAll(/\{([^{}]+)\}/g)].map(m=>m[1].split(',').map(expression));
assert.equal(actors.length,constants.get('NUMMOBJTYPES'));
assert(actors.every(a=>a.length===23));
const sounds=[...clean(sources['sounds.c']).match(/S_sfx\[\]\s*=\s*\{([\s\S]*?)\};/)[1]
  .matchAll(/\{\s*"([a-z0-9]+)"/g)].map(m=>m[1]);
assert.equal(sounds.length,constants.get('NUMSFX'));
const random=clean(sources['m_random.c']).match(/rndtable\[256\]\s*=\s*\{([^}]+)\}/)[1]
  .split(',').map(s=>s.trim()).filter(Boolean).map(Number);
assert.equal(random.length,256);
const table=clean(sources['tables.c']);
const integers=(name,count)=>{
  const body=table.match(new RegExp(`${name}\\[${count}\\]\\s*=\\s*\\{([^}]+)\\}`));
  assert(body,`Missing ${name}`);
  const values=body[1].split(',').map(s=>s.trim()).filter(Boolean).map(Number);
  assert.equal(values.length,count);assert(values.every(Number.isInteger));return values;
};
const sine=integers('finesine',10240),angle=integers('tantoangle',2049);
assert(sine.every(n=>n>=-65536&&n<=65536));
assert(angle.every((n,i)=>n>=0&&n<=0x20000000&&(!i||n>=angle[i-1])));
const deh=WadRead(FreedoomRead()).find(l=>l.name==='DEHACKED').bytes.toString('ascii');
const changes=[];
const fields=new Map([['Sprite number',0],['Sprite subnumber',1],['Duration',2],
  ['Next frame',4],['Unknown 1',5],['Unknown 2',6]]);
let frame=null;
for (const text of deh.split('\n')) {
  const line=text.trim();
  if(line.startsWith('['))break;
  if(!line||line.startsWith('#'))continue;
  const start=line.match(/^Frame (\d+)$/);
  if(start) {frame=Number(start[1]);assert(frame<states.length);continue;}
  if(frame===null)continue;
  const field=line.match(/^([^=]+?)\s*=\s*(-?\d+)$/);
  assert(field&&fields.has(field[1]),`Unsupported DEHACKED frame entry: ${line}`);
  const column=fields.get(field[1]),value=Number(field[2]);
  changes.push({frame,field:field[1],column,from:states[frame][column],to:value});
  states[frame][column]=value;
}
assert.equal(changes.length,version==='0.13.0'?7:5);
const header=Buffer.alloc(32);
header.write('TMST');header.writeUInt32LE(2,4);
[states.length,actors.length,sprites.length,actions.length,sounds.length,random.length]
  .forEach((n,i)=>header.writeUInt32LE(n,8+i*4));
const words=values=>{
  const bytes=Buffer.alloc(values.length*4);
  values.forEach((n,i)=>bytes.writeInt32LE(n,i*4));return bytes;
};
const names=(values,width)=>{
  const bytes=Buffer.alloc(values.length*width);
  values.forEach((s,i)=>bytes.write(s,i*width,width,'ascii'));return bytes;
};
const data=Buffer.concat([header,words(states.flat()),words(actors.flat()),
  names(sprites,4),names(sounds,8),words(sine),words(angle),Buffer.from(random)]);
put('TMDATA.BIN',data);
const upper=s=>s.replace(/^A_/,'').replace(/([a-z0-9])([A-Z])/g,'$1_$2').toUpperCase();
let defines='//Generated identifiers for TMDATA.BIN; see NOTICE and tools/toom/Data.mjs.\n\n';
for (const [name,value] of constants)
  if (/^(SPR_|S_|MT_|MF_)/.test(name))defines+=`#define TM_${name}\t${value}\n`;
defines+='\n';
actions.forEach((name,i)=>defines+=`#define TM_A_${upper(name)}\t${i}\n`);
defines+='\n';
for (const [name,value] of Object.entries({STATE_NUM:states.length,ACTOR_NUM:actors.length,
  SPRITE_NUM:sprites.length,ACTION_NUM:actions.length,SND_NUM:sounds.length,
  SINE_NUM:sine.length,ANGLE_NUM:angle.length,DATA_SIZE:data.length}))
  defines+=`#define TM_${name}\t${value}\n`;
put('TmData.HH',defines);
put('data.json',JSON.stringify({format:2,revision:manifest.revision,
  freedoomVersion:version,freedoomSha256:wadHash,
  sha256:createHash('sha256').update(data).digest('hex'),bytes:data.length,
  states:states.length,actors:actors.length,sprites:sprites.length,sounds:sounds.length,
  sine:sine.length,angles:angle.length,
  actions,freedoomFrameChanges:changes},null,2)+'\n');
console.log(`${process.argv.includes('--check')?'Verified':'Generated'} `+
  `${states.length} states, ${actors.length} actor types, ${data.length} bytes.`);
