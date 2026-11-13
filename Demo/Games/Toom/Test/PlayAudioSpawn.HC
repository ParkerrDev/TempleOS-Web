I64 tm_audio_old_ticks=0;

U0 TmAudioPrior(I64)
{
  Fs->task_end_cb=&SndTaskEndCB;
  while (TRUE) {Snd(60); tm_audio_old_ticks++; Sleep(1);}
}

U0 TmAudioSpawnTest()
{
  Play *play=PlayNew("C:/ORACLE/FREEDOOM.WAD","C:/ORACLE/TMDATA.BIN");
  CTaskSettings *settings;
  CTask *song;
  I64 old_data=Fs->user_data,ticks;
  Bool caught=FALSE,muted=Mute(FALSE);
  SettingsPush;
  Fs->draw_it=NULL; Refresh(,TRUE);
  Fs->user_data=0x12345678;
  song=Fs->song_task=Spawn(&TmAudioPrior,NULL,"Prior sound",,Fs);
  Sleep(20); settings=Fs->next_settings; ticks=tm_audio_old_ticks;
  try {
    PlayRun(play);
  } catch {
    if (Fs->except_ch=='SndSpawn') caught=Fs->catch_except=TRUE;
  }
  if (!caught || Fs->next_settings!=settings || Fs->song_task!=song ||
	Fs->user_data!=0x12345678 || play->task || play->audio->task ||
	play->audio->speaker.sound || play->audio->speaker.period ||
	play->game->level->motion->sound ||
	play->game->level->sectors->sound) throw('Restore');
  Sleep(20);
  if (tm_audio_old_ticks<=ticks || InU8(0x61)&3!=3) throw('OldTone');
  PlayDel(play);
  if (InU8(0x61)&3!=3) throw('Stolen');
  Fs->user_data=old_data; SettingsPop; Mute(muted);
  if (TaskValidate(song) || InU8(0x61)&3) throw('End');
  "AUDIO SPAWN FAULT PRIOR TONE RESTORED BAD 0\n";
}
TmAudioSpawnTest;
