I64 tm_audio_select_done=0,tm_audio_channels=0,tm_audio_distances=0;

U0 TmAudioSelectTest()
{
  I64 used=Fs->data_heap->used_u8s,size,*body,*ptr,n,m,i,j,op,kind,origin,
	snd,handle,playing,res,want,expected,x,y,sx,sy,map_num,volume;
  Audio audio;
  Sound sound;
  body=FileRead("C:/ORACLE/AUDIO.BIN",&size); ptr=body;
  if (!body || size<16 || size&7) throw('File');
  n=*ptr++; m=*ptr++;
  if (size!=16+n*56*8+m*7*8) throw('Size');
  MemSet(&sound,0,sizeof(Sound));
  for (i=0;i<n;i++) {
    MemSet(&audio,0,sizeof(Audio));
    op=*ptr++; kind=*ptr++; origin=*ptr++; snd=*ptr++;
    handle=*ptr++; playing=*ptr++;
    audio.handle=handle;
    if (playing) audio.speaker.sound=&sound;
    for (j=0;j<TM_CHANNEL_NUM;j++) {
      audio.channel[j].sound=*ptr++;
      audio.channel[j].kind=*ptr++;
      audio.channel[j].origin=*ptr++;
    }
    want=*ptr++; expected=*ptr++;
    if (op) {
      AudioStopOwner(&audio,kind,origin); res=-2;
    } else res=AudioChannelFind(&audio,kind,origin,snd);
    if (res!=want || !!audio.speaker.sound!=expected ||
	  expected && audio.handle!=handle) throw('Select');
    for (j=0;j<TM_CHANNEL_NUM;j++) {
      if (audio.channel[j].sound!=*ptr++) throw('Channel');
      if (audio.channel[j].kind!=*ptr++) throw('Kind');
      if (audio.channel[j].origin!=*ptr++) throw('Origin');
    }
    tm_audio_channels++;
  }
  for (i=0;i<m;i++) {
    x=*ptr++; y=*ptr++; sx=*ptr++; sy=*ptr++; map_num=*ptr++; volume=*ptr++;
    want=*ptr++;
    if (AudioAudible(x,y,sx,sy,map_num,volume)!=want) throw('Distance');
    tm_audio_distances++;
  }
  if (ptr!=body+size/8) throw('Tail');
  MemSet(&audio,0,sizeof(Audio)); audio.handle=-1;
  if (AudioChannelFind(&audio,0,0,0)!=-1 ||
	AudioChannelFind(&audio,0,0,TM_SND_NUM)!=-1) throw('Bounds');
  Free(body);
  if (Fs->data_heap->used_u8s!=used) throw('Cleanup');
  tm_audio_select_done=1;
  "AUDIO %d CHANNEL CASES %d DISTANCE CASES BAD 0\n",
	tm_audio_channels,tm_audio_distances;
}

TmAudioSelectTest;
