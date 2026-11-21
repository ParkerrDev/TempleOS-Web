import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readGameDisk} from './GameMedia.js';

// A ZIP containing Notes.txt and a deflated Disk/KQ1PCJR.IMG of 1024 zero bytes.
const disk=Buffer.alloc(1024),zip=Buffer.from(
  'UEsDBBQAAAAIAAAAIQDuQOUFCQAAAAcAAAAJAAAATm90ZXMudHh0S8usKCktSgUAUEsDBBQAAAAIAAAAIQAur7XvCwAAAAAEAAAQAAAARGlzay9LUTFQQ0pSLklNR2NgGAWjYBSMVAAAUEsBAhQDFAAAAAgAAAAhAO5A5QUJAAAABwAAAAkAAAAAAAAAAAAAAIABAAAAAE5vdGVzLnR4dFBLAQIUAxQAAAAIAAAAIQAur7XvCwAAAAAEAAAQAAAAAAAAAAAAAACAATAAAABEaXNrL0tRMVBDSlIuSU1HUEsFBgAAAAACAAIAdQAAAGkAAAAAAA==','base64');
const media={name:'KQ1PCJR.IMG',bytes:disk.length,sha256:createHash('sha256').update(disk).digest('hex')};
const read=(bytes,match=media)=>readGameDisk(new Blob([bytes]),match);
for(const bytes of [disk,zip])assert.deepEqual(Buffer.from(await read(bytes)),disk);
await assert.rejects(read(zip.subarray(0,-12)),/ZIP directory/);
await assert.rejects(read(zip,{...media,name:'MISSING.IMG'}),/does not contain/);
await assert.rejects(read(Buffer.alloc(1024,1)),/differs from the supported/);
await assert.rejects(read(disk.subarray(1)),/360 KB/);
console.log('Local disk import accepts a raw image and its zipped copy and rejects mismatched files.');
