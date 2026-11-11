import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,openSync,readSync,closeSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {makeDisk} from '../../engine/qcow2.js';
const dir=mkdtempSync(join(tmpdir(),'hemu-stock-disk-'));
try {
  const bytes=gunzipSync(readFileSync(new URL('../../vendor/images/templeos-hd.qcow2.gz',import.meta.url))),disk=makeDisk(bytes);
  writeFileSync(join(dir,'stock.qcow2'),bytes);
  execFileSync('qemu-img',['convert','-f','qcow2','-O','raw','stock.qcow2','expected.raw'],{cwd:dir});
  const fd=openSync(join(dir,'expected.raw'),'r'),hash=createHash('sha256');
  try {
    for(let off=0;off<disk.virtualSize;off+=1048576) {
      const count=Math.min(1048576,disk.virtualSize-off),expected=Buffer.alloc(count),actual=Buffer.alloc(count);
      assert.equal(readSync(fd,expected,0,count,off),count);
      disk.readInto(off/512,count/512,actual,0);
      assert(actual.equals(expected),'Stock disk differs from QEMU at byte '+off);hash.update(actual);
    }
  } finally {closeSync(fd);}
  console.log(JSON.stringify({qemu:execFileSync('qemu-img',['--version'],{encoding:'utf8'}).split('\n')[0],
    qcow2Sha256:createHash('sha256').update(bytes).digest('hex'),rawSha256:hash.digest('hex'),bytes:disk.virtualSize}));
} finally {rmSync(dir,{recursive:true,force:true});}
