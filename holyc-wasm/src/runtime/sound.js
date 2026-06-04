// sound.js — WebAudio PC-speaker emulation for the main thread.
//
// TempleOS sound is a single square-wave "PC speaker" tone. `tone(freq)` turns
// it on at a frequency (0 = silence). `note(freq, ms)` is handled by the worker
// which blocks for the duration; here we just set/clear the oscillator.
export class Speaker {
  constructor() {
    this.ac = null;
    this.osc = null;
    this.gain = null;
    this.on = false;
  }
  _ensure() {
    if (this.ac) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ac = new AC();
    this.gain = this.ac.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(this.ac.destination);
    this.osc = this.ac.createOscillator();
    this.osc.type = "square";
    this.osc.frequency.value = 440;
    this.osc.connect(this.gain);
    this.osc.start();
  }
  resume() { this._ensure(); if (this.ac.state === "suspended") this.ac.resume(); }
  tone(freq) {
    this._ensure();
    const now = this.ac.currentTime;
    if (!freq || freq <= 0) {
      this.gain.gain.setTargetAtTime(0, now, 0.005);
      this.on = false;
    } else {
      this.osc.frequency.setTargetAtTime(freq, now, 0.001);
      this.gain.gain.setTargetAtTime(0.12, now, 0.005);
      this.on = true;
    }
  }
  // A discrete note: ramp on then off after ms (used when worker posts notes).
  note(freq, ms) {
    this._ensure();
    const now = this.ac.currentTime;
    const dur = Math.max(0.02, ms / 1000);
    this.osc.frequency.setValueAtTime(freq, now);
    this.gain.gain.setTargetAtTime(0.12, now, 0.004);
    this.gain.gain.setTargetAtTime(0.0001, now + dur * 0.9, 0.01);
  }
}
