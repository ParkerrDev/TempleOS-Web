import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {root} from './Assets.mjs';

const manifest=JSON.parse(readFileSync(new URL('source/source.json',import.meta.url)));
const file=manifest.files.find(f=>f.path.endsWith('/sounds.c')),path=resolve(root,'tools/toom/source/sounds.c');
if(!existsSync(path)) {
  const url=`https://raw.githubusercontent.com/id-Software/DOOM/${manifest.revision}/${file.path}`;
  const response=await fetch(url);assert(response.ok);writeFileSync(path,Buffer.from(await response.arrayBuffer()));
}
const bytes=readFileSync(path);assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);
const clean=bytes.toString('ascii').replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'');
const body=clean.match(/S_sfx\[\]\s*=\s*\{([\s\S]*?)\};/);assert(body);
const values=[...body[1].matchAll(/\{\s*"[a-z0-9]+"\s*,\s*(?:true|false)\s*,\s*(\d+)/g)].map(m=>Number(m[1]));
assert.equal(values.length,109);assert(values.every(n=>n>=0&&n<=255));
const lines=[];for(let i=0;i<values.length;i+=16)lines.push('  '+values.slice(i,i+16).join(','));
const result='U8 tm_sound_priority[TM_SND_NUM]={\n'+lines.join(',\n')+'\n};\n';
const output=resolve(root,'games/Toom/TmSoundData.HH');
if(process.argv.includes('--check'))assert.equal(readFileSync(output,'ascii'),result);
else writeFileSync(output,result);
console.log('Verified 109 original sound priorities.');
