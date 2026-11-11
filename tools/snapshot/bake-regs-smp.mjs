import {readFileSync,writeFileSync} from "node:fs";
import {RegsRead,RegsSource} from "./Regs.mjs";
const path=process.argv[2];
if(!path)throw Error("Usage: node tools/snapshot/bake-regs-smp.mjs registers.txt [output.HC]");
const capture=RegsRead(readFileSync(path,"utf8"),4);
writeFileSync(process.argv[3]??new URL("../../hemu/src/snapregs-smp.HC",import.meta.url),RegsSource(capture));
console.log(`Generated four-core registers from ${capture.registerSha256}`);
