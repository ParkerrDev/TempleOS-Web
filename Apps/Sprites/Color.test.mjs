import assert from "node:assert/strict";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {gunzipSync} from "node:zlib";
import {GrNew} from "./Gr.js";

//Frozen before the HolyC port; this does not regenerate expected pixels.
const corpus=JSON.parse(gunzipSync(await readFile(new URL("Test/Corpus.json.gz",import.meta.url)))),
  codec=await GrNew(await readFile(new URL("../../build/Gr.wasm",import.meta.url))),
  bytes=s=>new Uint8Array(Buffer.from(typeof s==="number"?corpus.data[s]:s,"base64"));
for (const [i,c] of corpus.colors.entries())
  assert.deepEqual(codec.quantize(bytes(c.input),c.width,c.height,c.mode,c.alpha,
    {strength:c.strength}),bytes(c.output),`Color ${i}: ${c.pattern} ${c.mode} ${c.strength} ${c.alpha}`);
for (const [i,c] of corpus.gifs.entries())
  assert.deepEqual(codec.encodeGIF(c.frames.map(bytes),c.width,c.height,c.delay),
    bytes(c.output),"GIF "+i);
for (const [i,c] of corpus.zips.entries())
  assert.deepEqual(codec.zipFiles(c.files.map(f=>({name:f.name,bytes:bytes(f.bytes)}))),
    bytes(c.output),"ZIP "+i);
console.log(`HolyC codec matches ${corpus.colors.length} frozen color frames, ${corpus.gifs.length} GIF streams and ${corpus.zips.length} ZIP archives byte for byte.`);

if (process.argv.includes("--native")) {
  const sources={};
  for (const name of ["Gr","Color","Formats","Noise"])
    sources[name]=await readFile(new URL(name+".HC",import.meta.url),"utf8");
  const expand=text=>text.replace(/#include "([^"]+)"/g,(_,name)=>expand(sources[name])),
    inputs=[],outputs=[],calls=[];
  let inputSize=0,outputSize=0;
  function Case(input,expected,call) {
    inputs.push(input);outputs.push(expected);
    calls.push(`result=${call(inputSize)};\nSpriteCheck(${calls.length},result,actual_size,${outputSize},${expected.length});`);
    inputSize+=input.length;outputSize+=expected.length;
  }
  for (const c of corpus.colors) {
    const mode=c.mode==="stable"?2:c.mode==="fs"?1:0;
    Case(bytes(c.input),bytes(c.output),offset=>
      `SpriteQuantize(input+${offset},${bytes(c.input).length},${c.width},${c.height},${mode},${c.alpha},${c.strength});actual_size=${c.width*c.height}`);
  }
  for (const c of corpus.gifs) {
    const input=Buffer.concat(c.frames.map(bytes));
    Case(input,bytes(c.output),offset=>
      `SpriteGif(input+${offset},${input.length},${c.width},${c.height},${c.frames.length},${c.delay},&actual_size)`);
  }
  for (const c of corpus.zips) {
    const files=c.files.map(f=>({name:Buffer.from(f.name),body:bytes(f.bytes)}));
    let offset=files.length*32;
    const input=Buffer.alloc(offset+files.reduce((n,f)=>n+f.name.length+f.body.length,0));
    files.forEach((f,i)=>{
      [offset,offset+f.name.length,f.name.length,f.body.length].forEach((v,j)=>
        input.writeBigInt64LE(BigInt(v),i*32+j*8));
      input.set(f.name,offset);offset+=f.name.length;
      input.set(f.body,offset);offset+=f.body.length;
    });
    Case(input,bytes(c.output),offset=>
      `SpriteZip(input+${offset},${input.length},${files.length},&actual_size)`);
  }
  const {QemuRun}=await import("../../hemu/holyc-wasm/tests/oracle/Qemu.mjs"),
    code=expand(sources.Gr)+`
U8 *input=FileRead("C:/ORACLE/INPUT.BIN"),
    *expected=FileRead("C:/ORACLE/EXPECT.BIN"),*result;
I64 actual_size;
U0 SpriteCheck(I64 id,U8 *res,I64 size,I64 offset,I64 expected_size)
{
  if (!res || size!=expected_size || MemCmp(res,expected+offset,size)) {
    "Codec case %d failed: %s\\n",id,SpriteGrError;
    throw('Codec');
  }
  Free(res);
}
`+calls.join("\n")+`\nFree(input);Free(expected);"Codec:${calls.length}\\n";\n`,
    result=await QemuRun([code],{timeout:120,files:[
      {name:"INPUT.BIN",bytes:Buffer.concat(inputs)},
      {name:"EXPECT.BIN",bytes:Buffer.concat(outputs)}]}),
    dir=new URL("../../tmp/sprites/",import.meta.url);
  await mkdir(dir,{recursive:true});
  await writeFile(new URL("codec-native.json",dir),JSON.stringify(result,null,2)+"\n");
  assert.equal(result.results[0].except,"",JSON.stringify(result.results[0]));
  assert.equal(result.results[0].out,`Codec:${calls.length}\n`);
  console.log("Original V5.03 codec matches the same frozen corpus: "+result.evidence);
}
