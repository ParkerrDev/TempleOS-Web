//Exercise the original interpreter's parser, room transition and save slot A in V5.03.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {QemuRun} from "../../../../hemu/holyc-wasm/tests/oracle/Qemu.mjs";

assert(process.env.KQ_DISK,"Set KQ_DISK to your original KQ1PCJR.IMG.");
const disk=await readFile(process.env.KQ_DISK);
assert.equal(createHash("sha256").update(disk).digest("hex"),
  "9647acdbadb0b8ebd3af8d19a02cb549dc7282659cde0efe5d15390cafb4af29");
const files=[{name:"KQ.IMG",bytes:disk}];
for (const name of ["Cpu","Devices"])
  files.push({name:name.toUpperCase()+".HC",bytes:await readFile(new URL("../"+name+".HC",import.meta.url))});
const fixture=`
#include "C:/ORACLE/CPU.HC"
#include "C:/ORACLE/DEVICES.HC"
U0 TypeCommand(U8 *st)
{
  while (*st) KqKey(0,*st++);
  KqKey(28,13);
}
U32 Landscape()
{//Sample a strip of terrain below the animated flags and above the text box.
  I64 x;
  U32 h=2166136261;
  for (x=0;x<320;x+=2) h=(h^KqPixelGet(x,144))*16777619;
  return h&0xFFFFFFFF;
}
Bool Printed(I64 x,I64 y,U8 *word)
{//Read the parser's reply from the PCjr video banks through the BIOS font.
  I64 i,j;
  while (*word) {
    for (i=0;i<8;i++)
      for (j=0;j<8;j++)
        if (!!KqPixelGet(x*8+j,y*8+i)!=!!(kq_font[*word*8+i] & 1<<j)) return FALSE;
    x++;word++;
  }
  return TRUE;
}
U0 PlayDisk()
{
  I64 t,n;
  U32 castle;
  kq_disk=FileRead("C:/ORACLE/KQ.IMG",&n);
  kq_ram=CAlloc(0x100000);kq_font=text.font;KqBoot;
  for (t=0;t<=2500;t++) {
    switch (t) {
      case 160:case 400: KqKey(28,13);break;
      case 620:TypeCommand("look castle");break;
      case 850:castle=Landscape;break;
      case 860:TypeCommand("save game");break;
      case 1000:TypeCommand("a");break;
      case 1200:if (!kq_dirty) throw('NoSave');break;
      case 1210:case 1510:KqKey(72,0);break;
      case 1620:TypeCommand("get carrot");break;
      case 1650:if (Landscape==castle || !Printed(4,24,"pluck")) throw('NoCarrot');break;
      case 2110:TypeCommand("restore game");break;
      case 2270:TypeCommand("a");break;
      case 2500:if (Landscape!=castle || castle!=0x646CFF05) throw('NoReturn');break;
    }
    KqSlice(9000);
    if (kq_fault) throw('PCjr');
    KqTick;
  }
  Free(kq_ram);Free(kq_disk);
  "Grahame left the castle, picked the carrot, and returned to his saved room.\\n";
}
PlayDisk;
`;
const {results:[result]}=await QemuRun([fixture],{files,timeout:240});
assert.equal(result.except,"",result.out);
assert.match(result.out,/picked the carrot, and returned/);
console.log(result.out.trim());
