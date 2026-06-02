// Self-test for the WASM emitter: build modules by hand, instantiate, and check
// results against expected values. Run: node src/wasm/emitter.selftest.js
import { Module, Func, VT, EMPTY_BLOCK } from "./emitter.js";

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log("  ok  " + name); }
  else { fail++; console.log(" FAIL " + name); }
}

// --- Test 1: add(i64,i64)->i64 ---
{
  const m = new Module();
  const f = m.func([VT.i64, VT.i64], [VT.i64]);
  const b = new Func();
  b.local_get(0).local_get(1).op("i64_add");
  f.setBody([], b);
  m.exportFunc("add", f.index);
  const mod = new WebAssembly.Module(m.emit());
  const inst = new WebAssembly.Instance(mod, {});
  check("add(2,40)==42", inst.exports.add(2n, 40n) === 42n);
  check("add big", inst.exports.add(9007199254740991n, 1n) === 9007199254740992n);
}

// --- Test 2: a loop computing sum 1..n via local + loop/br_if ---
{
  const m = new Module();
  const f = m.func([VT.i64], [VT.i64]); // sum(n)
  const b = new Func();
  // locals: [0]=n (param), [1]=i, [2]=acc
  const I = 1, ACC = 2;
  b.i64_const(0).local_set(I);
  b.i64_const(0).local_set(ACC);
  b.block(EMPTY_BLOCK); //  outer (br 1 to exit)
  b.loop(EMPTY_BLOCK);  //  inner (br 0 to continue)
  //   if (i > n) break  -> i64.gt_s ; br_if 1
  b.local_get(I).local_get(0).op("i64_gt_s").br_if(1);
  //   acc += i
  b.local_get(ACC).local_get(I).op("i64_add").local_set(ACC);
  //   i += 1
  b.local_get(I).i64_const(1).op("i64_add").local_set(I);
  b.br(0);
  b.end(); // loop
  b.end(); // block
  b.local_get(ACC);
  f.setBody([{ count: 2, vt: VT.i64 }], b);
  m.exportFunc("sum", f.index);
  const inst = new WebAssembly.Instance(new WebAssembly.Module(m.emit()), {});
  check("sum(10)==55", inst.exports.sum(10n) === 55n);
  check("sum(100)==5050", inst.exports.sum(100n) === 5050n);
}

// --- Test 3: imported host function + memory + data segment + f64 ---
{
  const m = new Module();
  m.setMemory(1);
  const log = m.importFunc("env", "log", [VT.i64], []);
  const captured = [];
  // store the string "Hi" at offset 100 via data, then read first byte and log
  m.addData(100, [0x48, 0x69]); // "Hi"
  const f = m.func([], [VT.f64]);
  const b = new Func();
  // log(memory[100] as u8)
  b.i32_const(100).load("i64_load8_u", 0, 0).call(log);
  // return 3.5 * 2.0
  b.f64_const(3.5).f64_const(2.0).op("f64_mul");
  f.setBody([], b);
  m.exportFunc("run", f.index);
  m.exportMemory("memory");
  const inst = new WebAssembly.Instance(new WebAssembly.Module(m.emit()), {
    env: { log: (v) => captured.push(v) },
  });
  const r = inst.exports.run();
  check("import called with 'H'(72)", captured.length === 1 && captured[0] === 72n);
  check("f64 mul == 7.0", r === 7.0);
  const mem = new Uint8Array(inst.exports.memory.buffer);
  check("data 'Hi' present", mem[100] === 0x48 && mem[101] === 0x69);
}

// --- Test 4: forward reference (func A calls func B defined later) ---
{
  const m = new Module();
  const a = m.func([VT.i64], [VT.i64]); // a(x) = b(x)+1
  const bf = m.func([VT.i64], [VT.i64]); // b(x) = x*2
  const ab = new Func();
  ab.local_get(0).call(bf.index).i64_const(1).op("i64_add");
  a.setBody([], ab);
  const bb = new Func();
  bb.local_get(0).i64_const(2).op("i64_mul");
  bf.setBody([], bb);
  m.exportFunc("a", a.index);
  const inst = new WebAssembly.Instance(new WebAssembly.Module(m.emit()), {});
  check("a(20)==41 (fwd ref)", inst.exports.a(20n) === 41n);
}

// --- Test 5: global mutable + memory.grow + saturating float->int ---
{
  const m = new Module();
  m.setMemory(1);
  const g = m.addGlobal(VT.i64, true, new Func().i64_const(7));
  const f = m.func([VT.f64], [VT.i64]);
  const b = new Func();
  // return global + (i64)(f)  using saturating trunc
  b.global_get(g).local_get(0).fc("i64_trunc_sat_f64_s").op("i64_add");
  f.setBody([], b);
  m.exportFunc("f", f.index);
  const inst = new WebAssembly.Instance(new WebAssembly.Module(m.emit()), {});
  check("global+trunc(3.9)==10", inst.exports.f(3.9) === 10n);
  check("trunc handles huge (no trap)", typeof inst.exports.f(1e30) === "bigint");
}

console.log(`\nEmitter self-test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
