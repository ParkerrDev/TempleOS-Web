import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {root} from './Assets.mjs';

assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the original TempleOS oracle checkout.');
const game=resolve(root,'games/Toom'),out=resolve(process.env.OUT||'/tmp/toom-native-build'),
  read=n=>readFileSync(resolve(game,n)),hash=b=>createHash('sha256').update(b).digest('hex'),
  names=['Build.HC','RunBin.HC','Toom.PRJ','Native.HH','Load.HC',...[...read('Load.HC').toString('latin1').matchAll(/#include "([^"]+)"/g)]
    .map(m=>m[1].includes('.')?m[1]:m[1]+'.HC'),'TmOverlay.HC','TmScreen.HC','TmPlay.HC'],
  files=names.map(name=>({name,bytes:read(name)})),bundle=Buffer.concat(files.map(f=>f.bytes));
let offset=0;
const install=files.map(f=>{const line=`if (FileWrite("C:/TOOM/${f.name}",buf+${offset},${f.bytes.length})<0) throw('Write');`;offset+=f.bytes.length;return line;}).join('\n');
const source=`
U0 TmNativeBuild()
{
  I64 size,i,old_size,except=0;
  U8 *buf=FileRead("C:/ORACLE/PACK.BIN",&size),*bytes,*encoded,*old,
        *broken="U0 Broken(\\n",
        *hex="0123456789ABCDEF";
  if (!buf || size!=${bundle.length}) throw('Package');
  DirMk("C:/TOOM");
  ${install}
  Free(buf);
  Cd("C:/Home"); ExeFile("C:/TOOM/Build.HC");
  if (FileFind("C:/TOOM/ToomNew.BIN")) throw('Temp');
  bytes=FileRead("C:/TOOM/Toom.BIN",&size);
  if (!bytes || size<=32) throw('Module');
  FileWrite("C:/TOOM/Toom.PRJ",broken,StrLen(broken));
  try {ExePrint("ToomBuild;");}
  catch {except=Fs->except_ch; Fs->catch_except=TRUE;}
  if (except!='Compile' || FileFind("C:/TOOM/ToomNew.BIN"))
    throw('Cleanup');
  old=FileRead("C:/TOOM/Toom.BIN",&old_size);
  if (!old || old_size!=size || MemCmp(old,bytes,size)) throw('Previous');
  Free(old);
  "BUILD FAILED COMPILE PRESERVES PREVIOUS MODULE BAD 0\\n";
  encoded=MAlloc(size*2+1);
  for (i=0;i<size;i++) {
    encoded[i*2]=hex[bytes[i]>>4]; encoded[i*2+1]=hex[bytes[i]&15];
  }
  encoded[size*2]=0;
  "MODULE %d %s\\n",size,encoded;
  Free(encoded); Free(bytes);
}
TmNativeBuild;
`;
const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
mkdirSync(out,{recursive:true});
const built=await QemuRun([Buffer.from(source,'latin1')],{files:[{name:'PACK.BIN',bytes:bundle}],timeout:180});
writeFileSync(resolve(out,'native.json'),JSON.stringify(built,null,2)+'\n');
assert.equal(built.results[0].except,'');assert.match(built.results[0].out,/Errs:0 Warns:0/);
assert.match(built.results[0].out,/BUILD FAILED COMPILE PRESERVES PREVIOUS MODULE BAD 0/);
const match=built.results[0].out.match(/MODULE (\d+) ([0-9A-F]+)\n/);assert(match);
const binary=Buffer.from(match[2],'hex');assert.equal(binary.length,Number(match[1]));
const reference=JSON.parse(readFileSync(new URL('module-evidence.json',import.meta.url)));
assert.equal(binary.readBigUInt64LE(24),BigInt(binary.length));
assert.equal(binary.readBigInt64LE(8),0x7FFFFFFFFFFFFFFFn,'The module has no fixed origin.');
assert.equal(binary.subarray(4,8).toString('ascii'),'TOSB');
writeFileSync(resolve(out,'Toom.BIN'),binary);
const result={sourceFiles:Object.fromEntries(files.map(f=>[f.name,hash(f.bytes)])),includeOrder:names,
  loaderSha256:hash(read('RunBin.HC')),sourceSha256:hash(Buffer.from(source,'latin1')),bundleSha256:hash(bundle),
  binarySha256:hash(binary),bytes:binary.length,backend:built.backend,evidence:built.evidence,
  prototypeSha256:reference.source.binarySha256,matchesPrototype:hash(binary)===reference.source.binarySha256,
  scope:'Original TempleOS installs actual named source files, invokes Build.HC from another directory, validates the relocatable binary header, then deliberately fails compilation and checks previous binary preservation and temporary-file cleanup. Prototype equality is recorded, not assumed.'};
writeFileSync(resolve(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
