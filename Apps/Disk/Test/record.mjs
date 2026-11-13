import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
const dir=mkdtempSync(join(tmpdir(),'hemu-disk-')),commands=[];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function Run(command,...args) {
  commands.push([command,...args]);return execFileSync(command,args,{cwd:dir,encoding:'utf8'});
}
try {
  const version=Run('qemu-img','--version').split('\n')[0];
  Run('qemu-img','create','-f','qcow2','-o','cluster_size=4096,lazy_refcounts=off','zero.qcow2','128K');
  Run('qemu-io','-f','qcow2','-c','write -P 0x47 0 4096','-c','write -P 0x93 8192 4096',
    '-c','write -z 8192 4096','-c','write -P 0xA6 126976 4096','zero.qcow2');
  Run('qemu-img','check','zero.qcow2');
  Run('qemu-img','convert','-f','qcow2','-O','raw','zero.qcow2','expected.raw');
  Run('qemu-img','convert','-f','raw','-O','qcow2','-o','compat=0.10,cluster_size=512','expected.raw','v2.qcow2');
  Run('qemu-img','check','v2.qcow2');
  Run('qemu-img','convert','-f','qcow2','-O','raw','v2.qcow2','v2.raw');
  const expected=readFileSync(join(dir,'expected.raw'));
  assert.deepEqual(readFileSync(join(dir,'v2.raw')),expected);
  const files={};
  for(const name of ['zero.qcow2','v2.qcow2','expected.raw']) {
    const bytes=readFileSync(join(dir,name));files[name]={bytes:bytes.length,sha256:hash(bytes)};
    writeFileSync(new URL(name+'.gz',import.meta.url),gzipSync(bytes));
  }
  writeFileSync(new URL('evidence.json',import.meta.url),JSON.stringify({version,commands,files},null,2)+'\n');
  console.log(version+': independent qcow2 v2/v3 and raw fixtures recorded.');
} finally {rmSync(dir,{recursive:true,force:true});}
