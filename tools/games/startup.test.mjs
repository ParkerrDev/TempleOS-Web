import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {GAMES} from "../../GameCatalog.js";
import {RuntimeInputs,root} from "./Evidence.mjs";
import {GameFiles,StartInputs} from "./Install.mjs";

//games/startup.json must describe the entries, files and runtime the site has
//now. Anything else is stale: rerun node tools/games/start.mjs --write.
const record=JSON.parse(await readFile(new URL("games/startup.json",root))),
  stale=what=>"Game startup evidence is stale: "+what+
    ". Run node tools/games/start.mjs --write and review its results.";
assert.deepEqual(record.games.map(g=>g.name),GAMES.map(g=>g.name),stale("the Games entries"));
assert.deepEqual(record.inputs,await StartInputs(),stale("the check"));
const {engineSha256,...site}=record.site;
assert.match(engineSha256,/^[0-9a-f]{64}$/);
assert.deepEqual(site,await RuntimeInputs(),stale("the site runtime"));
const words=/^(running|returned|closed|never|except:.*|fault|timeout|harness-error)$/;
for (const [i,entry] of record.games.entries()) {
  assert.equal(entry.filesSha256,(await GameFiles(GAMES[i])).sha256,stale(entry.name+"'s files"));
  for (const side of [entry.real,entry.site]) {
    assert.match(side.run,words);
    assert.match(side.quit,/^(esc|shift-esc|ignored|-)$/);
    assert.equal(side.quit=="-",side.run!="running",entry.name+": a quit stage only follows a run.");
  }
  assert.equal(entry.same,JSON.stringify(entry.real)==JSON.stringify(entry.site));
}
const same=record.games.filter(g=>g.same);
console.log("Game startup: "+same.length+" of "+record.games.length+
  " entries start and quit as in TempleOS V5.03, for these exact files and runtime.");
