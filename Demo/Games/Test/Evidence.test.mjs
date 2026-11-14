import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {GameInputs,Hash,root,GAME_CHECKS} from "./Evidence.mjs";
import {compileHemu} from "../../../Kernel/Compile.js";

const evidence=JSON.parse(await readFile(new URL("Demo/Games/Test/Evidence.json",root))),
  inputs=await GameInputs();
assert.equal(evidence.format,1);
assert.deepEqual(Object.keys(evidence.programs),GAME_CHECKS,"All qualified scenarios retain their evidence.");
for (const [key,value] of Object.entries(inputs))
  assert.deepEqual(evidence[key],value,"Native game evidence is stale: "+key+
    ". Run node Demo/Games/Test/Native.mjs --write and review its results.");
assert.equal(evidence.engineSha256,Hash(compileHemu().bytes),"Compiled HEMU differs from the verified game runtime.");
for (const [name,program] of Object.entries(evidence.programs))
  assert.equal(program.sourceSha256,Hash(await readFile(new URL("Demo/Games/"+name+".HC",root))),
    name+" source differs from its native game evidence.");
console.log("Native game evidence: exact source, harness, compiler, host and HEMU revisions match.");
