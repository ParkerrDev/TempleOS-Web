import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {root} from './Assets.mjs';
import {WadRead,MapRead} from './Wad.mjs';

export async function BrainMaps() {
  const manifest=JSON.parse(readFileSync(new URL('brain-maps.json',import.meta.url))),
    asset=JSON.parse(readFileSync(new URL('assets.json',import.meta.url))).versions['0.13.0'],
    path=resolve(root,'tools/toom/.assets/freedoom-0.13.0-phase2.wad'),hash=b=>createHash('sha256').update(b).digest('hex');
  if(!existsSync(path)) {
    const response=await fetch(asset.url);assert(response.ok);
    const archive=Buffer.from(await response.arrayBuffer());assert.equal(hash(archive),manifest.archiveSha256);
    const result=spawnSync('python3',['-c',
      'import io,sys,zipfile;sys.stdout.buffer.write(zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())).read(sys.argv[1]))',
      manifest.entry],{input:archive,maxBuffer:64*1024*1024});
    assert.equal(result.status,0,result.stderr?.toString());assert.equal(hash(result.stdout),manifest.wadSha256);
    mkdirSync(resolve(root,'tools/toom/.assets'),{recursive:true});
    writeFileSync(path,result.stdout);
  }
  const bytes=readFileSync(path);assert.equal(hash(bytes),manifest.wadSha256);
  const lumps=WadRead(bytes),maps=[];
  for(let i=0;i<lumps.length;i++)if(/^MAP\d\d$/.test(lumps[i].name)) {
    const map=MapRead(lumps,i),spitters=map.things.filter(t=>t[3]===89),targets=map.things.filter(t=>t[3]===87);
    if(spitters.length||targets.length)maps.push({map:map.name,spitters,targets});
  }
  assert.deepEqual(maps,manifest.maps);
  return {bytes,manifest};
}
