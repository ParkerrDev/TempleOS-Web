//Freedoom 0.13.0 Phase 1, kept in games/upstream/Freedoom as its release ZIP
//ships it. Every test and the package read the IWAD through FreedoomRead,
//which checks it against assets.json. "node tools/toom/Assets.mjs" downloads
//the pinned release and checks that the kept files are its own.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

export const root=fileURLToPath(new URL('../../',import.meta.url));
const manifest=JSON.parse(readFileSync(new URL('assets.json',import.meta.url)));
export const version=manifest.default;
export const asset=manifest.versions[version];
export const wadHash=asset.sha256;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

export function FreedoomRead()
{//FREEDOOM_WAD, or the kept IWAD.
  const bytes=readFileSync(process.env.FREEDOOM_WAD||resolve(root,asset.dir,'freedoom1.wad'));
  assert.equal(hash(bytes),wadHash,`Expected the official Freedoom ${version} Phase 1 IWAD.`);
  return bytes;
}

if (process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const response=await fetch(asset.url);assert(response.ok,`Download failed: ${response.status}`);
  const archive=Buffer.from(await response.arrayBuffer());
  assert.equal(hash(archive),asset.archiveSha256,'Release ZIP checksum differs.');
  for(const name of Object.keys(asset.files)) {
    const out=spawnSync('python3',['-I','-c',
      'import io,sys,zipfile;sys.stdout.buffer.write(zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())).read(sys.argv[1]))',
      asset.archiveDir+name],{input:archive,maxBuffer:64*1024*1024});
    assert.equal(out.status,0,out.stderr?.toString());
    assert.equal(hash(out.stdout),asset.files[name],name+' differs in the release.');
    assert(out.stdout.equals(readFileSync(resolve(root,asset.dir,name))),name+' differs from the release.');
  }
  console.log(`${asset.dir}: ${Object.keys(asset.files).join(', ')} are Freedoom ${version}'s own.`);
}
