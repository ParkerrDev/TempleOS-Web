import {readFileSync,openSync,writeSync,closeSync} from "node:fs";
import {makeDisk,fat32Upload} from "../QCow2.js";
const [image,source]=process.argv.slice(2);
if(!image||!source)throw Error("Usage: node Kernel/Snapshot/Inject.mjs PRIVATE.raw PROBE.HC");
const disk=makeDisk(readFileSync(image));
fat32Upload(disk,"SNAPFPU.HC",readFileSync(source),"Home");
const fd=openSync(image,"r+");
try {for(const [lba,bytes]of disk.overlay)writeSync(fd,bytes,0,bytes.length,lba*512);}
finally {closeSync(fd);}
