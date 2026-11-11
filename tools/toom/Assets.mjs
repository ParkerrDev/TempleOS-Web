import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

export const root=fileURLToPath(new URL('../../',import.meta.url));
const manifest=JSON.parse(readFileSync(new URL('assets.json',import.meta.url)));
export const version=process.env.FREEDOOM_VERSION||manifest.default;
export const asset=manifest.versions[version];
assert(asset,`Unsupported Freedoom release: ${version}`);
export const wadHash=asset.sha256;
const cache=resolve(root,`tools/toom/.assets/freedoom-${version}.wad`);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function FreedoomRead()
{
  let bytes;
  if(process.env.FREEDOOM_WAD)bytes=readFileSync(process.env.FREEDOOM_WAD);
  else if(version==='0.12.1')bytes=Buffer.concat(Array.from({length:7},(_,i)=>readFileSync(resolve(root,
      `games/upstream/TOOM/Freedoom${i.toString().padStart(2,'0')}.BIN`))));
  else {
    assert(existsSync(cache),`Run FREEDOOM_VERSION=${version} node tools/toom/Assets.mjs first.`);
    bytes=readFileSync(cache);
  }
  assert.equal(hash(bytes),wadHash,`Expected the official Freedoom ${version} Phase 1 IWAD.`);
  return bytes;
}

if (process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if(!process.env.FREEDOOM_WAD&&version!=='0.12.1'&&!existsSync(cache)) {
    const response=await fetch(asset.url);assert(response.ok,`Download failed: ${response.status}`);
    const archive=Buffer.from(await response.arrayBuffer());
    assert.equal(hash(archive),asset.archiveSha256,'Release ZIP checksum differs.');
    const decoded=spawnSync('python3',['-c',
      'import io,sys,zipfile;sys.stdout.buffer.write(zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())).read(sys.argv[1]))',
      asset.archiveEntry],{input:archive,maxBuffer:64*1024*1024});
    assert.equal(decoded.status,0,decoded.stderr?.toString());
    assert.equal(hash(decoded.stdout),wadHash,'IWAD checksum differs.');
    mkdirSync(resolve(root,'tools/toom/.assets'),{recursive:true});
    writeFileSync(cache,decoded.stdout);
  }
  const path=resolve(root,'games/Toom/FREEDOOM.WAD'),bytes=FreedoomRead();
  if(version!=='0.12.1'&&!existsSync(cache)) {
    mkdirSync(resolve(root,'tools/toom/.assets'),{recursive:true});
    writeFileSync(cache,bytes);
  }
  const notice=readFileSync(resolve(root,`tools/toom/licenses/Freedoom-${version}.txt`));
  assert.equal(hash(notice),asset.licenseSha256);
  writeFileSync(path,bytes);
  writeFileSync(resolve(root,'games/Toom/Freedoom-COPYING.txt'),notice);
  console.log(`Prepared Freedoom ${version}, ${bytes.length} bytes: ${path}\nSHA-256 ${wadHash}`);
}
