import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

export const wadHash='c403ea7c27b5b2b77e4c0ca0b691669186790e572065e7eb2b0382801bcb18cc';
export const root=fileURLToPath(new URL('../../',import.meta.url));
export function FreedoomRead()
{
  const bytes=process.env.FREEDOOM_WAD?readFileSync(process.env.FREEDOOM_WAD):
    Buffer.concat(Array.from({length:7},(_,i)=>readFileSync(resolve(root,
      `games/upstream/TOOM/Freedoom${i.toString().padStart(2,'0')}.BIN`))));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),wadHash,
    'Expected the unmodified official Freedoom 0.12.1 Phase 1 IWAD.');
  return bytes;
}

if (process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const path=resolve(root,'games/Toom/FREEDOOM.WAD'),bytes=FreedoomRead();
  writeFileSync(path,bytes);
  console.log(`Prepared ${bytes.length} bytes: ${path}\nSHA-256 ${wadHash}`);
}
