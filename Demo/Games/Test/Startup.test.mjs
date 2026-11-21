import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {ENTRIES} from "../../../Apps/Programs.js";
import {compileHemu} from "../../../hemu/holyc-wasm/Apps/HEMU/Kernel/Compile.js";
import {Hash,RuntimeInputs,root} from "./Evidence.mjs";
import {GameFiles,StartInputs} from "./Install.mjs";

//Demo/Games/Startup.json must describe the entries, files and runtime the site has
//now, each entry made on the record's runtime and check (its nativeSha256).
//Anything else is stale: rerun node Demo/Games/Test/Start.mjs --write.
const record=JSON.parse(await readFile(new URL("Demo/Games/Startup.json",root))),
  stale=what=>"Game startup evidence is stale: "+what+
    ". Run node Demo/Games/Test/Start.mjs --write and review its results.";
assert.deepEqual(record.games.map(g=>g.name),ENTRIES.map(g=>g.name),stale("the entries"));
assert.deepEqual(record.inputs,await StartInputs(),stale("the check"));
const {engineSha256,...site}=record.site;
assert.equal(engineSha256,Hash(compileHemu().bytes),stale("the compiled engine"));
assert.deepEqual(site,await RuntimeInputs(),stale("the site runtime"));
const words=/^(running|returned|closed|never|except:.*|fault|timeout|harness-error)$/;
const native=Hash(JSON.stringify({real:record.real,site:record.site,inputs:record.inputs}));
for (const [i,entry] of record.games.entries()) {
  assert.equal(entry.nativeSha256,native,stale(entry.name+"'s run, made on another runtime or check,"));
  assert.equal(entry.filesSha256,(await GameFiles(ENTRIES[i])).sha256,stale(entry.name+"'s files"));
  for (const side of [entry.real,entry.site]) {
    assert.match(side.run,words);
    assert.match(side.quit,/^(early|esc|shift-esc|ignored|-)$/);
    assert(side.run=="running" || side.quit=="-",entry.name+": a quit stage only follows a run.");
  }
  assert.equal(entry.same,JSON.stringify(entry.real)==JSON.stringify(entry.site));
}
const same=record.games.filter(g=>g.same);
console.log("Game startup: "+same.length+" of "+record.games.length+
  " entries and programs start and quit as in TempleOS V5.03, for these exact files and runtime.");
