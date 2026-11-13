//The PC speaker: one square wave. Each change carries the guest's TSC
//nanoseconds, and a frame's changes arrive together, so they are scheduled
//at their guest times LEAD seconds behind, not when the message lands. A
//change that would play late or too far ahead moves the clock's origin.
const LEAD=0.05,SLACK=0.3,LEVEL=0.04;

export function Speaker()
{
  let context=null,oscillator=null,gain=null,frequency=0,paused=false,
    origin=null;
  function At(ns) {
    const now=context.currentTime;
    if (!Number.isFinite(ns))
      return now;
    let at=origin===null?-1:origin+ns/1e9;
    if (at<now || at>now+SLACK) {
      origin=now+LEAD-ns/1e9;
      at=now+LEAD;
    }
    return at;
  }
  function Apply(at) {
    if (!context)
      return;
    if (frequency>0)
      oscillator.frequency.setValueAtTime(frequency,at);
    gain.gain.setValueAtTime(!paused && frequency>0?LEVEL:0,at);
  }
  function Now() {
    if (!context)
      return;
    const now=context.currentTime;
    oscillator.frequency.cancelScheduledValues(now);
    gain.gain.cancelScheduledValues(now);
    origin=null;
    Apply(now);
  }
  return {
    Tone(value,ns) {
      frequency=Number.isFinite(value) && value>0?value:0;
      if (context)
        Apply(At(Number(ns)));
    },
    Pause(value) {paused=!!value;Now();},
    Stop() {frequency=0;paused=true;Now();},
    async Resume() {
      if (!context || context.state==="closed") {
        const audio=new (window.AudioContext || window.webkitAudioContext)();
        try {
          const tone=audio.createOscillator(),level=audio.createGain();
          tone.type="square";level.gain.value=0;
          tone.connect(level).connect(audio.destination);tone.start();
          context=audio;oscillator=tone;gain=level;
        } catch(error) {
          try {await audio.close();} catch(closeError) {console.warn("Speaker cleanup:",closeError);}
          throw error;
        }
      }
      Now();
      if (context.state!=="running")
        await context.resume();
    },
  };
}
