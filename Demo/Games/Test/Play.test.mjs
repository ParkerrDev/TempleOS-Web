import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {ENTRIES,PROGRAMS} from "../../../Apps/Programs.js";
import {PLAYS} from "../../../Apps/Games/GamePlays.js";
import {BrowserInputs} from "./BrowserEvidence.mjs";
import {Hash,root} from "./Evidence.mjs";
import {KvmInputs} from "./Install.mjs";
import {PlayEvents} from "./Play.mjs";
import {PlayCompare} from "./PlayCmp.mjs";

//Demo/Games/Play.json must play today's scripts (Apps/Games/GamePlays.js) on
//the files and runtimes that Startup.json and BrowserChks.json bind, which
//Startup.test.mjs and NativeGamesAudit.mjs --check prove current, each run
//made with its record's inputs (nativeSha256, browser's and kvm's
//inputsSha256), and its verdicts must be PlayCmp.mjs's. Anything else is
//stale: rerun npm run test:games:play.
const json=name=>readFile(new URL("Demo/Games/"+name+".json",root)).then(JSON.parse),
  [record,startup,checked]=await Promise.all([json("Play"),json("Startup"),json("BrowserChks")]),
  stale=what=>"Game play evidence is stale: "+what+
    ". Run npm run test:games:play and review its results.",
  plain=v=>JSON.parse(JSON.stringify(v)),
  words=r=>({run:r.start,quit:r.quit,end:r.end});
assert.deepEqual(record.games.map(g=>g.name),ENTRIES.map(g=>g.name),stale("the entries"));
assert.deepEqual(record.native,{real:startup.real,site:startup.site,inputs:startup.inputs},
  stale("the native runtime"));
assert.deepEqual(record.browser,await BrowserInputs(),stale("the browser runtime"));
assert.deepEqual(record.kvm,await KvmInputs(),stale("native HEMU, its capture or the check"));
const made=block=>block && Hash(JSON.stringify(block));
for (const [i,g] of record.games.entries()) {
  const id=ENTRIES[i].packageId || ENTRIES[i].file;
  PlayEvents(g.name,"play");
  assert.equal(!!g.browser,ENTRIES[i].runs!="templeos",stale(g.name+"'s browser coverage"));
  assert(g.kvm,stale(g.name+"'s native HEMU coverage"));
  assert.equal(g.program,PROGRAMS.includes(ENTRIES[i]) || undefined,g.name+": program is Apps/Programs.js's.");
  assert.equal(g.script,PLAYS[g.name],stale(g.name+"'s script"));
  assert.equal(g.nativeSha256,made(record.native),stale(g.name+"'s native runs"));
  assert(!g.browser || g.browser.inputsSha256==made(record.browser),stale(g.name+"'s browser runs"));
  assert(!g.kvm || g.kvm.inputsSha256==made(record.kvm),stale(g.name+"'s runs in native HEMU"));
  assert.equal(g.filesSha256,startup.games[i].filesSha256,stale(g.name+"'s files"));
  assert.deepEqual([words(g.real.control),words(g.site.control)],
    [startup.games[i].real,startup.games[i].site],g.name+": Startup.json is not the controls.");
  assert(!g.browser || record.browser && g.browser.sourceSha256==checked.programs[id]?.sourceSha256,
    stale(g.name+"'s browser source"));
  assert(!g.kvm || record.kvm && g.kvm.filesSha256==g.filesSha256,stale(g.name+"'s files in native HEMU"));
  assert.deepEqual(g.verdict,plain(PlayCompare(g)),g.name+": the verdict is not PlayCmp.mjs's.");
  assert(startup.games[i].same && g.verdict.templeos,g.name+" failed its TempleOS launch or play check.");
  assert(g.verdict.kvmMatch,g.name+" differed from V5.03 on native HEMU.");
  if (g.browser) {
    assert(g.verdict.browserPlays,g.name+" failed its direct browser play check.");
    assert(g.program || checked.programs[id]?.startup,g.name+" failed browser startup.");
  }
}
const games=record.games.filter(g=>!g.program).length,
  browser=record.games.filter(g=>g.browser).length;
console.log(games+" games passed in TempleOS and the direct browser runner. "+
  record.games.length+" total entries matched the recorded V5.03 play and quit checks on both HEMU builds. "+
  browser+" entries passed their direct browser checks.");
