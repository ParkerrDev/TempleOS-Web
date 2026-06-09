globalThis.__JITSTATS = {};
await import("/tmp/jitboot.mjs");
const s = globalThis.__JITSTATS;
const top = Object.entries(s).sort((a,b)=>b[1]-a[1]).slice(0,18);
console.log("\n=== opcodes that END jit blocks (what to implement next, hi->lo) ===");
for (const [op,c] of top) console.log(`  op ${op.padStart(5)} : ${c} blocks end here`);
console.log("total blocks ending at unhandled op:", Object.values(s).reduce((a,b)=>a+b,0));
