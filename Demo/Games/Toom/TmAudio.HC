#define TM_CHANNEL_NUM 8

class Channel
{
  I64 sound,kind,origin;
};

class Audio
{
  SoundBank *bank;
  CTask *task;
  Speaker speaker;
  Channel channel[TM_CHANNEL_NUM];
  I64 handle;
  Bool paused;
};

U0 AudioChannelDel(Audio *tmpa,I64 n)
{
  if (tmpa->channel[n].sound) {
    if (tmpa->handle==n) {
      SpeakerStart(&tmpa->speaker,NULL,cnts.jiffies);
      tmpa->handle=-1;
    }
    tmpa->channel[n].sound=0;
  }
}

U0 AudioStopOwner(Audio *tmpa,I64 kind,I64 origin)
{
  I64 i;
  Channel *tmpc=tmpa->channel;
  for (i=0;i<TM_CHANNEL_NUM;i++,tmpc++)
    if (tmpc->sound && tmpc->kind==kind && tmpc->origin==origin) {
      AudioChannelDel(tmpa,i);
      break;
    }
}

I64 AudioChannelFind(Audio *tmpa,I64 kind,I64 origin,I64 sound)
{//Keep the original first-free, same-origin and priority ordering.
  I64 i;
  Channel *tmpc;
  if (!(0<sound<TM_SND_NUM)) return -1;
  for (i=0;i<TM_CHANNEL_NUM;i++) {
    tmpc=tmpa->channel+i;
    if (!tmpc->sound) break;
    if (kind && tmpc->kind==kind && tmpc->origin==origin) {
      AudioChannelDel(tmpa,i);
      break;
    }
  }
  if (i==TM_CHANNEL_NUM) {
    for (i=0;i<TM_CHANNEL_NUM;i++)
      if (tm_sound_priority[tmpa->channel[i].sound]>=tm_sound_priority[sound])
	break;
    if (i==TM_CHANNEL_NUM) return -1;
    AudioChannelDel(tmpa,i);
  }
  tmpc=tmpa->channel+i;
  tmpc->sound=sound; tmpc->kind=kind; tmpc->origin=origin;
  return i;
}

Bool AudioAudible(I64 x,I64 y,I64 source_x,I64 source_y,I64 map_num,
	I64 volume=127)
{//The speaker has one amplitude, but the original distance rule clips it.
  I64 dx=AbsI64(x-source_x),dy=AbsI64(y-source_y),
	distance=dx+dy-MinI64(dx,dy)/2;
  if (map_num!=8 && distance>1200*65536) return FALSE;
  if (distance>=160*65536) {
    if (map_num==8) {
      distance=MinI64(distance,1200*65536);
      volume=15+(volume-15)*(1200*65536-distance)>>16/1040;
    } else volume=volume*(1200*65536-distance)>>16/1040;
  }
  return volume>0;
}

U0 AudioStop(Audio *tmpa)
{//Logical owners and the borrowed physical stream end together.
  I64 i;
  for (i=0;i<TM_CHANNEL_NUM;i++) AudioChannelDel(tmpa,i);
  SpeakerStart(&tmpa->speaker,NULL,cnts.jiffies);
  tmpa->handle=-1;
}

U0 AudioDel(Audio *tmpa)
{
  if (tmpa) {
    if (tmpa->task) throw('Active');
    AudioStop(tmpa);
    while (!SpeakerStop(&tmpa->speaker)) Sleep(1);
    SoundBankDel(tmpa->bank); Free(tmpa);
  }
}

Audio *AudioNew(Wad *wad,GameData *data)
{
  Audio *res=CAlloc(sizeof(Audio));
  res->handle=-1;
  try {
    res->bank=SoundBankNew(wad,data);
  } catch {
    AudioDel(res);
  }
  return res;
}

I64 AudioStart(Audio *tmpa,I64 kind,I64 origin,I64 sound,
	Bool audible=TRUE)
{//A disabled effect still replaces an old sound from the same owner.
  I64 n;
  Sound *clip;
  if (!(0<=kind<=2) || !kind && origin) throw('Origin');
  if (!(0<sound<TM_SND_NUM)) throw('Sound');
  if (!audible) return -1;
  AudioStopOwner(tmpa,kind,origin);
  n=AudioChannelFind(tmpa,kind,origin,sound);
  if (n<0) return -1;
  try {
    clip=SoundBankGet(tmpa->bank,sound);
    if (clip) {
      tmpa->handle=n;
      SpeakerStart(&tmpa->speaker,clip,cnts.jiffies,tmpa->paused);
    }
  } catch {
    AudioChannelDel(tmpa,n);
  }
  if (!clip) return -1;
  return n;
}

U0 AudioUpdate(Audio *tmpa)
{//The single speaker may have displaced any of the eight logical channels.
  I64 i;
  for (i=0;i<TM_CHANNEL_NUM;i++)
    if (tmpa->channel[i].sound &&
	  (i!=tmpa->handle || !tmpa->speaker.sound)) AudioChannelDel(tmpa,i);
}

U0 AudioPause(Audio *tmpa,Bool val)
{
  tmpa->paused=val;
  SpeakerPause(&tmpa->speaker,val,cnts.jiffies);
}
