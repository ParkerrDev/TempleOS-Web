import assert from "node:assert/strict";
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from "node:fs";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {tmpdir,cpus} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";

export function OpcodeOracle(name) {
  const source=new URL(`./${name}-oracle.c`,import.meta.url),fixture=new URL(`./${name}-oracle.txt`,import.meta.url),
    provenance=new URL(`./${name}-oracle.json`,import.meta.url),
    Hash=file=>createHash("sha256").update(readFileSync(file)).digest("hex");
  if(process.argv.includes("--record")) {
    assert.equal(process.arch,"x64","the independent opcode oracle needs x86-64 hardware");
    const temp=mkdtempSync(join(tmpdir(),"hemu-opcode-")),exe=join(temp,"oracle");
    try {
      execFileSync("cc",["-O2","-Wall","-Wextra","-mno-red-zone",fileURLToPath(source),"-o",exe]);
      writeFileSync(fixture,execFileSync(exe,{maxBuffer:8*1024*1024}));
      writeFileSync(provenance,JSON.stringify({cpu:cpus()[0].model,arch:process.arch,platform:process.platform,
        compiler:execFileSync("cc",["--version"],{encoding:"utf8"}).split("\n")[0],
        reference:"https://cdrdv2-public.intel.com/774492/325383-sdm-vol-2abcd.pdf",
        sourceHash:Hash(source),fixtureHash:Hash(fixture)},null,2)+"\n");
    } finally {rmSync(temp,{recursive:true,force:true});}
  }
  const evidence=JSON.parse(readFileSync(provenance,"utf8"));
  assert.equal(Hash(source),evidence.sourceHash,"rerun --record after changing the hardware oracle");
  assert.equal(Hash(fixture),evidence.fixtureHash,"hardware results must retain their recorded hash");
  return readFileSync(fixture,"utf8").trim().split("\n");
}
