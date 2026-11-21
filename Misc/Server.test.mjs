import assert from "node:assert/strict";
import {createServer} from "node:http";
import {once} from "node:events";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {ServeReq} from "./Server.mjs";
import {AdventurePackages} from "../Demo/Games/AdventurePkgs.mjs";

const server=createServer(ServeReq).listen(0,"127.0.0.1");
await once(server,"listening");
const base="http://127.0.0.1:"+server.address().port;
try {
  for (const path of ["build/Search.wasm","hemu/build/disk.wasm",
      "hemu/holyc-wasm/Apps/HEMU/Kernel/JitCore.wasm"]) {
    const response=await fetch(base+"/"+path),
      bytes=new Uint8Array(await response.arrayBuffer());
    assert.equal(response.status,200,path+" must be served and published.");
    assert.equal(response.headers.get("content-type"),"application/wasm");
    assert.deepEqual(bytes,new Uint8Array(await readFile(new URL("../"+path,import.meta.url))));
    assert(WebAssembly.validate(bytes));
  }
  for (const path of ["Apps/Search/Search.test.mjs","hemu/holyc-wasm/Apps/HEMU/Kernel/Test/Disk.mjs"])
    assert.equal((await fetch(base+"/"+path)).status,404,"Test tooling stays outside the publication.");
  //A store the deploy sends whole to the CDN is served whole, whatever a file is.
  const store="Demo/Games/Upstream/MaliciousTestimonies/README.md",got=await fetch(base+"/"+store);
  assert.equal(got.status,200,store+" is in a store the deploy serves whole.");
  assert.equal(await got.text(),await readFile(new URL("../"+store,import.meta.url),"utf8"));
  assert.equal((await fetch(base+"/Demo/Games/README.md")).status,404,"A note outside a store stays unserved.");
  for (const game of await AdventurePackages())
    for (const file of game.files) {
      const response=await fetch(base+"/"+file.url);
      assert.equal(response.status,200,file.url+" must reach the game runner.");
      assert.equal(createHash("sha256").update(new Uint8Array(await response.arrayBuffer())).digest("hex"),
        file.sha256,file.url+" must retain its packaged bytes.");
    }
  console.log("Publication serves HolyC search/disk/JIT modules with exact bytes, stores whole, and excludes test tools.");
} finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
