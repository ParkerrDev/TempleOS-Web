import assert from "node:assert/strict";
import {createServer} from "node:http";
import {once} from "node:events";
import {readFile} from "node:fs/promises";
import {ServeReq} from "./Server.mjs";

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
  console.log("Publication serves HolyC search/disk/JIT modules with exact bytes and excludes test tools.");
} finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
