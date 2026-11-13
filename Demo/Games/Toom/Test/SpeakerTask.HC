I64 tm_song_done=0,tm_song_runs=0,tm_song_old_cnt=0,tm_song_old_end=0,
      tm_song_samples=0,tm_song_skipped=0,tm_song_late=0,tm_song_last=-1;

U0 TmSongOldEnd()
{
  tm_song_old_end++;
  SndTaskEndCB;
}

U0 TmSongOld(I64)
{
  Fs->task_end_cb=&TmSongOldEnd;
  while (TRUE) {
    tm_song_old_cnt++;
    Sleep(1);
  }
}

I64 TmSongTick(Speaker *tmps,I64 now)
{//Record scheduler delivery without changing the production deadline.
  I64 sample,late;
  if (tmps->sound && !tmps->paused && now>=tmps->start) {
    sample=(now-tmps->start)*140/1000;
    if (sample<tmps->sound->cnt && sample>tm_song_last) {
      if (tm_song_last>=0) tm_song_skipped+=sample-tm_song_last-1;
      late=now-tmps->start-(sample*1000+139)/140;
      tm_song_late=MaxI64(tm_song_late,late);
      tm_song_last=sample; tm_song_samples++;
    }
  }
  return SpeakerTick(tmps,now);
}

U0 TmSongWait(Speaker *tmps,Bool active)
{
  I64 end=cnts.jiffies+5000;
  while (TRUE) {
    if (active) {
      if (tmps->period) return;
    } else if (!tmps->sound) return;
    if (cnts.jiffies>=end) throw('SongWait');
    Sleep(1);
  }
}

U0 TmSongTest()
{
  Speaker speaker;
  Sound sound;
  U8 body[140];
  CTask *old_song,*song,*saved=Fs->song_task;
  I64 run,i,count,writes,levels=0,now;
  Bool muted=Mute(FALSE),caught;
  MemSet(&speaker,0,sizeof(Speaker));
  for (i=0;i<140;i++) body[i]=i%2*30+30;
  sound.body=body; sound.cnt=140;
  try {
    SettingsPush; levels++;
    old_song=Fs->song_task=Spawn(&TmSongOld,NULL,"Old song",,Fs);
    Sleep(20);
    if (!tm_song_old_cnt) throw('OldStart');
    for (run=0;run<2;run++) {
      SettingsPush; levels++;
      count=tm_song_old_cnt;
      if (Fs->song_task || !Bt(&old_song->task_flags,TASKf_SUSPENDED))
	throw('Suspend');
      tm_song_last=-1;
      caught=FALSE;
      try {
	SpeakerStart(&speaker,&sound,cnts.jiffies);
	song=Fs->song_task=Spawn(&SongTask,&speaker,"DP sound",,Fs);
	TmSongWait(&speaker,TRUE);
	Sleep(50);
	now=cnts.jiffies;
	SpeakerPause(&speaker,TRUE,now);
	if (speaker.period || tm_song_gate) throw('Pause');
	writes=tm_song_writes;
	Sleep(80);
	if (speaker.period || tm_song_writes!=writes) throw('Paused');
	SpeakerPause(&speaker,FALSE,cnts.jiffies);
	if (!speaker.period || tm_song_gate!=3) throw('Resume');
	if (run) throw('SndExit');
	TmSongWait(&speaker,FALSE);
	if (speaker.period || tm_song_gate) throw('End');
      } catch {
	if (Fs->except_ch=='SndExit') caught=Fs->catch_except=TRUE;
      }
      if (caught!=run || tm_song_old_cnt!=count) throw('Catch');
      while (!SpeakerStop(&speaker)) Sleep(1);
      SettingsPop; levels--;
      if (Fs->song_task!=old_song || TaskValidate(song) ||
	    Bt(&old_song->task_flags,TASKf_SUSPENDED) || speaker.period ||
	    speaker.sound) throw('Owner');
      Sleep(20);
      if (tm_song_old_cnt<=count) throw('Restore');
      tm_song_runs++;
    }
    SettingsPop; levels--;
    if (Fs->song_task!=saved || tm_song_old_end!=1 ||
	  TaskValidate(old_song)) throw('OldEnd');
    tm_song_done=1;
    "HARDWARE GATE %d\n",InU8(0x61)&3;
    "SONG %d RUNS SUSPEND RESUME PAUSE EXIT FAULT BAD 0\n",tm_song_runs;
    "DELIVERY %d SAMPLES %d SKIPPED %d MS LATE\n",
	  tm_song_samples,tm_song_skipped,tm_song_late;
  } catch {
    while (levels) {SettingsPop; levels--;}
    Mute(muted);
  }
  Mute(muted);
}

TmSongTest;
