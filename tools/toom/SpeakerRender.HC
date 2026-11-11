I64 tm_audio_done=0,tm_audio_samples=0,tm_audio_skipped=0,
      tm_audio_last=0,tm_audio_time=0,tm_audio_gap=0;

I64 TmAudioTick(Speaker *tmps,I64 now)
{//Observe the real cooperative song task during unchanged frame rendering.
  I64 sample;
  if (tmps->sound && !tmps->paused) {
    sample=MinI64((now-tmps->start)*140/1000,tmps->sound->cnt);
    if (sample>tm_audio_last) {
      tm_audio_skipped+=sample-tm_audio_last-1;
      if (sample<tmps->sound->cnt) tm_audio_samples++;
      tm_audio_gap=MaxI64(tm_audio_gap,now-tm_audio_time);
      tm_audio_last=sample; tm_audio_time=now;
    }
  }
  return SpeakerTick(tmps,now);
}

U0 TmAudioTest(Bool render=TRUE)
{
  Play *play=NULL;
  Speaker speaker;
  Sound sound;
  U8 body[420];
  I64 i,start,frames=0,elapsed,stats[6];
  Bool muted=Mute(FALSE),settings=FALSE;
  MemSet(&speaker,0,sizeof(Speaker));
  for (i=0;i<420;i++) body[i]=i%2*30+30;
  sound.body=body; sound.cnt=420;
  try {
    play=PlayNew("C:/ORACLE/FREEDOOM.WAD","C:/ORACLE/TMDATA.BIN");
    for (i=0;i<3;i++) PlayFrame(play);
    SettingsPush; settings=TRUE;
    start=tm_audio_time=cnts.jiffies;
    tm_audio_samples=1;
    SpeakerStart(&speaker,&sound,start);
    Fs->song_task=Spawn(&SongTask,&speaker,"DP sound",,Fs);
    while (speaker.sound) {
      if (render) {PlayFrame(play); frames++;}
      Sleep(1);
      if (cnts.jiffies-start>10000) throw('Deadline');
    }
    elapsed=cnts.jiffies-start;
    if (render && !frames || tm_audio_samples+tm_audio_skipped!=420 ||
	  speaker.period)
      throw('Count');
    SettingsPop; settings=FALSE;
    PlayDel(play); play=NULL;
    stats[0]=frames; stats[1]=elapsed; stats[2]=tm_audio_samples;
    stats[3]=tm_audio_skipped; stats[4]=tm_audio_gap; stats[5]=speaker.period;
    if (!FileWrite("C:/ORACLE/AUDIO.BIN",stats,sizeof(stats))) throw('Write');
    tm_audio_done=1;
    "AUDIO RENDER %d FRAMES %d MS %d SAMPLES %d SKIPPED GAP %d MS BAD 0\n",
	  frames,elapsed,tm_audio_samples,tm_audio_skipped,tm_audio_gap;
    "HARDWARE GATE %d\n",InU8(0x61)&3;
  } catch {
    if (settings) SettingsPop;
    PlayDel(play);
    Mute(muted);
  }
  Mute(muted);
}

TmAudioTest;
