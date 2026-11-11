I64 tm_sound_done=0,tm_sound_cases=0,tm_sound_samples=0,tm_sound_faults=0;

U0 TmSoundTest()
{
  I64 used=Fs->data_heap->used_u8s,heap,size,n,i,j,cnt,period,frequency,
	read_bytes,fail,mode,*body=FileRead("C:/ORACLE/SOUND.BIN",&size),
	*ptr=body;
  Wad *wad=WadNew("C:/ORACLE/SOUNDS.WAD");
  Sound *sound;
  Bool caught;
  if (!body || !wad || size<8 || size&7) throw('Files');
  n=*ptr++;
  if (n!=wad->cnt) throw('Cases');
  heap=Fs->data_heap->used_u8s;
  if (SoundNew(NULL,0) || SoundNew(wad,-1) || SoundNew(wad,n) ||
	SoundPeriod(NULL,0)) throw('Bounds');
  for (i=0;i<n;i++) {
    cnt=*ptr++;
    read_bytes=wad->read_bytes;
    sound=SoundNew(wad,i);
    if (cnt<0) {
      if (sound) throw('Reject');
      j=4;
      if (wad->dir[i].size<4) j=0;
      if (wad->read_bytes-read_bytes!=j) throw('RejectIO');
    } else {
      if (!sound || sound->cnt!=cnt ||
	    wad->read_bytes-read_bytes!=4+cnt ||
	    SoundPeriod(sound,-1) || SoundPeriod(sound,cnt) ||
	    SoundPeriod(sound,I64_MAX)) throw('Decode');
      for (j=0;j<cnt;j++) {
	period=SoundPeriod(sound,j); frequency=0;
	if (period) frequency=1193181/period;
	if (period!=*ptr++ || frequency!=*ptr++) throw('Period');
	tm_sound_samples++;
      }
      SoundDel(sound);
    }
    if (Fs->data_heap->used_u8s!=heap) throw('Heap');
    tm_sound_cases++;
  }
  if (ptr!=body+size/8) throw('Tail');
  for (mode=0;mode<2;mode++) for (fail=1;fail<=4;fail++) {
    tm_sound_read_fail=mode; tm_sound_fail=fail; tm_sound_calls=0;
    sound=NULL; caught=FALSE;
    try {
      sound=SoundNew(wad,0);
    } catch {
      if (Fs->except_ch=='SndTest') caught=Fs->catch_except=TRUE;
    }
    if (mode && (fail==1 || fail==4)) {
      if (caught) throw('ReadFail');
    } else if (!caught) throw('Throw');
    if (sound || Fs->data_heap->used_u8s!=heap) throw('Unwind');
    tm_sound_faults++;
  }
  tm_sound_fail=0; tm_sound_read_fail=FALSE;
  sound=SoundNew(wad,0);
  if (!sound) throw('Retry');
  SoundDel(sound); WadDel(wad); Free(body);
  if (Fs->data_heap->used_u8s!=used) throw('Cleanup');
  tm_sound_done=1;
  "SOUND %d LUMPS %d SAMPLES %d FAULTS BAD 0\n",
	tm_sound_cases,tm_sound_samples,tm_sound_faults;
}

TmSoundTest;
