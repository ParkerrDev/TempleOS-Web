class Speaker
{
  Sound *sound;
  I64 start,pause,period;
  Bool paused;
};

Bool SpeakerPeriod(Speaker *tmps,I64 period)
{//Use the native sound mutex and invalidate its piano-key cache.
  Bool on;
  if (Bt(&sys_semas[SEMA_MUTE],0)) {
    tmps->period=0;
    return TRUE;
  }
  if (LBts(&sys_semas[SEMA_SND],0)) return FALSE;
  on=InU8(0x61)&3==3;
  if (period!=tmps->period || scrncast.ona || period && !on ||
	!period && on) {
    scrncast.ona=0;
    if (period) {
      OutU8(0x43,0xB6);
      OutU8(0x42,period);
      OutU8(0x42,period.u8[1]);
      OutU8(0x61,InU8(0x61)|3);
    } else OutU8(0x61,InU8(0x61)&~3);
    tmps->period=period;
  }
  LBtr(&sys_semas[SEMA_SND],0);
  return TRUE;
}

Bool SpeakerStop(Speaker *tmps)
{
  if (tmps->period && !SpeakerPeriod(tmps,0)) return FALSE;
  tmps->sound=NULL;
  tmps->paused=FALSE;
  return TRUE;
}

I64 SpeakerTick(Speaker *tmps,I64 now)
{//Absolute jiffies avoid accumulating a truncated seven-millisecond delay.
  Sound *sound=tmps->sound;
  I64 sample=0;
  if (tmps->paused) {
    if (tmps->period && !SpeakerPeriod(tmps,0)) return now+1;
  } else if (sound) {
    if (now>=tmps->start+(sound->cnt*JIFFY_FREQ+TM_SND_HZ-1)/TM_SND_HZ) {
      if (!SpeakerStop(tmps)) return now+1;
    } else {
      if (now>tmps->start) sample=(now-tmps->start)*TM_SND_HZ/JIFFY_FREQ;
      if (!SpeakerPeriod(tmps,SoundPeriod(sound,sample))) return now+1;
      return tmps->start+((sample+1)*JIFFY_FREQ+TM_SND_HZ-1)/TM_SND_HZ;
    }
  }
  if (!sound && tmps->period && !SpeakerStop(tmps)) return now+1;
  return now+JIFFY_FREQ/TM_SND_HZ;
}

U0 SpeakerStart(Speaker *tmps,Sound *sound,I64 now,Bool paused=FALSE)
{//The immutable decoded stream stays owned by the caller until stopped.
  tmps->sound=sound;
  tmps->start=tmps->pause=now;
  tmps->paused=paused;
  if (sound && sound->cnt) SpeakerTick(tmps,now);
  else SpeakerStop(tmps);
}

U0 SpeakerPause(Speaker *tmps,Bool val,I64 now)
{
  if (val!=tmps->paused) {
    if (val) tmps->pause=now;
    else tmps->start+=now-tmps->pause;
    tmps->paused=val;
  }
  SpeakerTick(tmps,now);
}

U0 SpeakerTaskEnd()
{//Local callbacks can be relocated by the native module loader.
  SndTaskEndCB;
}

U0 SongTask(Speaker *tmps)
{//SettingsPop ends this task before the parent's decoded sounds are freed.
  Fs->task_end_cb=&SpeakerTaskEnd;
  while (TRUE) SleepUntil(SpeakerTick(tmps,cnts.jiffies));
}
