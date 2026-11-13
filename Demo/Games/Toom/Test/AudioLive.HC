I64 tm_audio_live_done=0,tm_audio_live_cases=0,tm_audio_live_faults=0;

U0 TmAudioClip(SoundBank *bank,I64 n,I64 count,I64 tone)
{
  Sound *sound=CAlloc(sizeof(Sound));
  sound->cnt=count;
  if (count) {
    sound->body=MAlloc(count);
    MemSet(sound->body,tone,count);
  }
  bank->sound[n]=sound;
}

U0 TmAudioLiveTest()
{
  Wad wad;
  Lump lump;
  U8 names[TM_SND_NUM][8];
  GameData data;
  Audio *audio=NULL;
  Sound *clip;
  I64 initial=Fs->data_heap->used_u8s,used,heap,i,n,old,fail,reads;
  Bool caught,locked=FALSE,muted=Mute(FALSE);
  MemSet(&wad,0,sizeof(Wad)); MemSet(&data,0,sizeof(GameData));
  try {
    used=Fs->data_heap->used_u8s;
    for (fail=1;fail<=2;fail++) {
      caught=FALSE; tm_sound_calls=0; tm_sound_fail=fail;
      try {
	audio=AudioNew(&wad,&data);
      } catch {
	if (Fs->except_ch=='SndTest') caught=Fs->catch_except=TRUE;
      }
      if (!caught || audio || Fs->data_heap->used_u8s!=used)
	throw('Alloc');
      tm_audio_live_faults++;
    }
    tm_sound_fail=0;
    for (i=0;i<2;i++) {
      caught=FALSE;
      try {
	if (i) audio=AudioNew(&wad,NULL);
	else audio=AudioNew(NULL,&data);
      } catch {
	if (Fs->except_ch=='Owner') caught=Fs->catch_except=TRUE;
      }
      if (!caught || audio || Fs->data_heap->used_u8s!=used)
	throw('Owner');
      tm_audio_live_faults++;
    }
    audio=AudioNew(&wad,&data);
    if (audio->handle!=-1 || audio->speaker.sound || wad.read_bytes)
      throw('New');
    for (i=1;i<TM_SND_NUM;i++) {
      audio->bank->loaded[i]=TRUE;
      if (SoundIndex(i)) TmAudioClip(audio->bank,i,140,i%127+1);
    }
    heap=Fs->data_heap->used_u8s;
    for (i=1;i<TM_SND_NUM;i++) {
      AudioStop(audio);
      n=AudioStart(audio,1,10,TM_SFX_PISTOL);
      clip=audio->speaker.sound; old=audio->handle;
      if (n<0 || !clip || !audio->speaker.period) throw('Start');
      if (AudioStart(audio,1,10,i,FALSE)!=-1 ||
	    audio->speaker.sound!=clip || audio->handle!=old)
	throw('Distant');
      n=AudioStart(audio,2,10,i);
      if (SoundIndex(i)) {
	if (n<0 || audio->speaker.sound!=audio->bank->sound[i] ||
	      audio->handle!=n) throw('Replace');
      } else if (n!=-1 || audio->speaker.sound!=clip ||
	    audio->handle!=old) throw('Disabled');
      AudioUpdate(audio);
      for (old=0;old<TM_CHANNEL_NUM;old++)
	if (!!audio->channel[old].sound ^^ old==audio->handle)
	  throw('Prune');
      AudioStop(audio);
      AudioStart(audio,1,10,TM_SFX_PISTOL);
      n=AudioStart(audio,1,10,i);
      if (!SoundIndex(i) && (n!=-1 || audio->speaker.sound ||
	    audio->speaker.period)) throw('Same');
      SpeakerTick(&audio->speaker,audio->speaker.start+1000);
      AudioUpdate(audio);
      if (audio->speaker.sound || audio->speaker.period ||
	    audio->handle!=-1) throw('End');
      for (old=0;old<TM_CHANNEL_NUM;old++)
	if (audio->channel[old].sound) throw('Channel');
      if (Fs->data_heap->used_u8s!=heap) throw('Heap');
      tm_audio_live_cases++;
    }
    AudioPause(audio,TRUE); reads=tm_speaker_cnt;
    AudioStart(audio,1,20,TM_SFX_PISTOL);
    if (!audio->speaker.paused || !audio->speaker.sound ||
	  audio->speaker.period || tm_speaker_cnt!=reads) throw('Hold');
    SpeakerTick(&audio->speaker,audio->speaker.start+10000);
    if (!audio->speaker.sound || audio->speaker.period) throw('Freeze');
    AudioPause(audio,FALSE);
    if (audio->speaker.paused || !audio->speaker.period) throw('Resume');
    AudioPause(audio,TRUE);
    if (audio->speaker.period || tm_speaker_port&3) throw('Silence');
    AudioStop(audio); AudioPause(audio,FALSE);
    SoundDel(audio->bank->sound[TM_SFX_PISTOL]);
    audio->bank->sound[TM_SFX_PISTOL]=NULL;
    AudioStart(audio,1,10,TM_SFX_SHOTGN); clip=audio->speaker.sound;
    if (AudioStart(audio,1,20,TM_SFX_PISTOL)!=-1 ||
	  audio->speaker.sound!=clip) throw('Missing');
    if (AudioStart(audio,1,10,TM_SFX_PISTOL)!=-1 ||
	  audio->speaker.sound) throw('Missing2');
    TmAudioClip(audio->bank,TM_SFX_PISTOL,0,0);
    AudioPause(audio,TRUE);
    if (AudioStart(audio,0,0,TM_SFX_PISTOL)<0 || audio->speaker.sound ||
	  audio->speaker.period) throw('Empty');
    AudioUpdate(audio); AudioPause(audio,FALSE);
    SoundDel(audio->bank->sound[TM_SFX_PISTOL]);
    audio->bank->sound[TM_SFX_PISTOL]=NULL;
    audio->bank->loaded[TM_SFX_PISTOL]=FALSE;
    MemSet(&lump,0,sizeof(Lump));
    MemSet(names,0,sizeof(names));
    MemCpy(names[TM_SFX_PISTOL],"PISTOL",6);
    MemCpy(lump.name,"DPPISTOL",8); lump.size=3;
    wad.cnt=1; wad.dir=&lump; data.sound=names;
    heap=Fs->data_heap->used_u8s;
    for (i=0;i<2;i++) {
      AudioStart(audio,1,10,TM_SFX_SHOTGN); clip=audio->speaker.sound;
      caught=FALSE;
      try {
	AudioStart(audio,1,20-i*10,TM_SFX_PISTOL);
      } catch {
	if (Fs->except_ch=='Sound') caught=Fs->catch_except=TRUE;
      }
      if (!caught || audio->bank->loaded[TM_SFX_PISTOL] ||
	    Fs->data_heap->used_u8s!=heap) throw('LazyFail');
      if (!i && audio->speaker.sound!=clip || i && audio->speaker.sound)
	throw('FailOld');
      AudioUpdate(audio);
      for (n=0;n<TM_CHANNEL_NUM;n++)
	if (audio->channel[n].sound==TM_SFX_PISTOL) throw('FailSlot');
      tm_audio_live_faults++;
    }
    AudioStart(audio,1,10,TM_SFX_SHOTGN);
    if (LBts(&sys_semas[SEMA_SND],0)) throw('Sema');
    locked=TRUE;
    AudioStop(audio);
    if (audio->speaker.sound || !audio->speaker.period) throw('Pending');
    LBtr(&sys_semas[SEMA_SND],0); locked=FALSE;
    SpeakerTick(&audio->speaker,cnts.jiffies);
    if (audio->speaker.period || tm_speaker_port&3) throw('Retry');
    for (i=0;i<3;i++) {
      caught=FALSE;
      try {
	if (!i) AudioStart(audio,3,1,TM_SFX_PISTOL);
	else if (i==1) AudioStart(audio,0,1,TM_SFX_PISTOL);
	else AudioStart(audio,1,1,TM_SND_NUM);
      } catch {
	if (Fs->except_ch=='Origin' || Fs->except_ch=='Sound')
	  caught=Fs->catch_except=TRUE;
      }
      if (!caught || Fs->data_heap->used_u8s!=heap) throw('Bounds');
      tm_audio_live_faults++;
    }
    caught=FALSE; audio->task=Fs;
    try {
      AudioDel(audio);
    } catch {
      if (Fs->except_ch=='Active') caught=Fs->catch_except=TRUE;
    }
    audio->task=NULL;
    if (!caught || Fs->data_heap->used_u8s!=heap) throw('Borrowed');
    tm_audio_live_faults++;
    AudioStart(audio,0,0,TM_SFX_SHOTGN);
    if (!audio->speaker.period) throw('Global');
    AudioDel(audio); audio=NULL;
    if (tm_speaker_port&3 || Fs->data_heap->used_u8s!=used)
      throw('Cleanup');
  } catch {
    if (locked) LBtr(&sys_semas[SEMA_SND],0);
    AudioDel(audio); Mute(muted);
  }
  Mute(muted);
  if (Fs->data_heap->used_u8s!=initial) throw('Unwind');
  tm_audio_live_done=1;
  "AUDIO LIVE %d EFFECTS %d FAULTS OWNERS PAUSE END HEAP BAD 0\n",
	tm_audio_live_cases,tm_audio_live_faults;
}

TmAudioLiveTest;
