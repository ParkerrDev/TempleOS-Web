// protocol.js — shared layout for the SharedArrayBuffer control block used to
// coordinate the worker (running WASM) and the main thread (input + audio).
//
// Control SAB (Int32Array): synchronous Sleep/Yield + input ring + sound ring.
export const CTRL = {
  // --- control / handshake ---
  RUNNING: 0,        // 1 while a program runs (main sets 0 to request stop)
  SLEEP_FUTEX: 1,    // worker Atomics.wait()s on this for Sleep()
  // --- keyboard ring (chars) ---
  KB_HEAD: 2,        // write index (main thread)
  KB_TAIL: 3,        // read index (worker)
  // --- mouse ---
  MS_X: 4, MS_Y: 5, MS_Z: 6, MS_LB: 7, MS_RB: 8,
  // --- sound ring ---
  SND_HEAD: 9,       // write index (worker)
  SND_TAIL: 10,      // read index (main thread)
  // --- stats / status ---
  FRAME: 11,         // incremented by worker on each flip
  DONE: 12,          // worker sets 1 when program returns
  _RESERVED: 13,
  HEADER_LEN: 16,    // ints reserved for header
};

export const KB_RING = 256;   // keyboard ring capacity (ints)
export const SND_RING = 512;  // sound ring capacity (entries of 2 ints: type,arg)

// Offsets (in Int32 units) of the ring regions after the header.
export const KB_BASE = CTRL.HEADER_LEN;
export const SND_BASE = KB_BASE + KB_RING;
export const TOTAL_INTS = SND_BASE + SND_RING * 2;

// sound command types
export const SND_TONE = 1;   // arg = freq (Hz), 0=off
export const SND_NOTE = 2;   // arg = freq; followed by duration handled via Sleep

export function makeControlSAB() {
  const sab = new SharedArrayBuffer(TOTAL_INTS * 4);
  return sab;
}
