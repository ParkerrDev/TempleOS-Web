export function Speaker()
{
  let context=null,oscillator=null,gain=null,frequency=0,paused=false;
  function Apply() {
    if(!context)return;
    const now=context.currentTime;
    if(frequency>0)oscillator.frequency.setValueAtTime(frequency,now);
    gain.gain.setValueAtTime(!paused&&frequency>0?.04:0,now);
  }
  return {
    Tone(value) {frequency=Number.isFinite(value)&&value>0?value:0;Apply();},
    Pause(value) {paused=!!value;Apply();},
    Stop() {frequency=0;paused=true;Apply();},
    async Resume() {
      if(!context||context.state==="closed") {
        const audio=new (window.AudioContext||window.webkitAudioContext)();
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
      Apply();
      if(context.state!=="running")await context.resume();
    },
  };
}
