I64 tm_speaker_done=0,tm_speaker_cases=0;

U0 TmSpeakerTrace(I64 start,I64 period)
{
  if (period) {
    if (tm_speaker_cnt!=start+4 ||
	  tm_speaker_ports[start]!=0x43 ||
	  tm_speaker_values[start]!=0xB6 ||
	  tm_speaker_ports[start+1]!=0x42 ||
	  tm_speaker_values[start+1]!=period&255 ||
	  tm_speaker_ports[start+2]!=0x42 ||
	  tm_speaker_values[start+2]!=period>>8 ||
	  tm_speaker_ports[start+3]!=0x61 ||
	  tm_speaker_values[start+3]!=0xA3) throw('TraceOn');
  } else if (tm_speaker_cnt!=start+1 ||
	tm_speaker_ports[start]!=0x61 || tm_speaker_values[start]!=0xA0)
    throw('TraceOff');
  if (scrncast.ona || Bt(&sys_semas[SEMA_SND],0)) throw('Sema');
}

U0 TmSpeakerTest()
{
  Speaker speaker;
  Sound sound;
  U8 body[140];
  I64 i,j,now=12345,next,period,old_period=0,trace;
  Bool muted=Mute(FALSE);
  MemSet(&speaker,0,sizeof(Speaker));
  for (i=0;i<140;i++) body[i]=i%3*30;
  sound.body=body; sound.cnt=140;
  try {
    SpeakerStart(&speaker,&sound,now);
    for (i=0;i<140;i++) {
      next=now+((i+1)*1000+139)/140;
      period=tm_tone_periods[body[i]];
      for (j=(i*1000+139)/140;j<((i+1)*1000+139)/140;j++) {
	trace=tm_speaker_cnt;
	if (SpeakerTick(&speaker,now+j)!=next ||
	      speaker.period!=period) throw('Clock');
	if (period!=old_period) TmSpeakerTrace(trace,period);
	else if (tm_speaker_cnt!=trace) throw('Repeat');
	old_period=period; tm_speaker_cases++;
      }
    }
    trace=tm_speaker_cnt;
    SpeakerTick(&speaker,now+1000);
    TmSpeakerTrace(trace,0);
    if (speaker.sound || speaker.period) throw('End');
    SpeakerStart(&speaker,&sound,now);
    SpeakerTick(&speaker,now+143);
    if (speaker.period!=tm_tone_periods[body[20]]) throw('Late');
    SpeakerPause(&speaker,TRUE,now+144);
    if (speaker.period || !speaker.paused) throw('Pause');
    trace=tm_speaker_cnt;
    SpeakerTick(&speaker,now+9000);
    SpeakerPause(&speaker,TRUE,now+10000);
    if (tm_speaker_cnt!=trace || speaker.pause!=now+144) throw('Held');
    SpeakerPause(&speaker,FALSE,now+10144);
    if (speaker.start!=now+10000 || speaker.paused ||
	  speaker.period!=tm_tone_periods[body[20]]) throw('Resume');
    SpeakerStop(&speaker);
    SpeakerStart(&speaker,&sound,now);
    LBts(&sys_semas[SEMA_SND],0);
    trace=tm_speaker_cnt;
    if (SpeakerTick(&speaker,now+8)!=now+9 || speaker.period ||
	  tm_speaker_cnt!=trace || !Bt(&sys_semas[SEMA_SND],0))
      throw('Busy');
    LBtr(&sys_semas[SEMA_SND],0);
    SpeakerTick(&speaker,now+8);
    TmSpeakerTrace(trace,tm_tone_periods[30]);
    Mute(TRUE);
    trace=tm_speaker_cnt;
    SpeakerTick(&speaker,now+9);
    if (speaker.period || tm_speaker_cnt!=trace) throw('Mute');
    Mute(FALSE);
    SpeakerTick(&speaker,now+10);
    TmSpeakerTrace(trace,tm_tone_periods[30]);
    trace=tm_speaker_cnt;
    scrncast.ona=60;
    SpeakerTick(&speaker,now+11);
    TmSpeakerTrace(trace,tm_tone_periods[30]);
    tm_speaker_port=0xA0;
    trace=tm_speaker_cnt;
    SpeakerTick(&speaker,now+12);
    TmSpeakerTrace(trace,tm_tone_periods[30]);
    LBts(&sys_semas[SEMA_SND],0);
    SpeakerStart(&speaker,NULL,now+12);
    if (!speaker.period || speaker.sound) throw('StopBusy');
    LBtr(&sys_semas[SEMA_SND],0);
    SpeakerTick(&speaker,now+13);
    if (speaker.period || speaker.sound) throw('Stop');
    SpeakerStart(&speaker,&sound,now);
    SpeakerTick(&speaker,I64_MAX);
    if (speaker.sound || speaker.period) throw('Overflow');
    sound.cnt=0;
    SpeakerStart(&speaker,&sound,now);
    if (speaker.sound || speaker.period) throw('Empty');
    tm_speaker_done=1;
    "SPEAKER %d CLOCK POINTS PORTS MUTE BUSY PAUSE STOP BAD 0\n",
	  tm_speaker_cases;
  } catch {
    LBtr(&sys_semas[SEMA_SND],0);
    Mute(muted);
  }
  Mute(muted);
}

TmSpeakerTest;
