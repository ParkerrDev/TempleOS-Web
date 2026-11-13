#define TM_TONE_NUM 128
#define TM_SND_HZ 140

U16 tm_tone_periods[TM_TONE_NUM]={
  0,6818,6628,6449,6279,6087,5906,5736,
  5575,5423,5279,5120,4971,4830,4697,4554,
  4435,4307,4186,4058,3950,3836,3728,3615,
  3519,3418,3323,3224,3131,3043,2960,2875,
  2794,2711,2633,2560,2485,2415,2348,2281,
  2213,2153,2089,2032,1975,1918,1864,1810,
  1757,1709,1659,1612,1565,1521,1478,1435,
  1395,1355,1316,1280,1242,1207,1173,1140,
  1107,1075,1045,1015,986,959,931,905,
  879,854,829,806,783,760,739,718,
  697,677,658,640,621,604,586,570,
  553,538,522,507,493,479,465,452,
  439,427,415,403,391,380,369,359,
  348,339,329,319,310,302,293,285,
  276,269,261,253,246,239,232,226,
  219,213,207,201,195,190,184,179
};

class Sound
{
  U8 *body;
  I64 cnt;
};

U0 SoundDel(Sound *tmps)
{
  if (tmps) {
    Free(tmps->body);
    Free(tmps);
  }
}

Sound *SoundNew(Wad *tmpw,I64 lump)
{//Read only the declared DP stream, at most 65535 samples.
  Sound *tmps;
  I64 cnt,size;
  U8 header[4],*ptr=header;
  Bool valid=FALSE;
  if (!tmpw || !(0<=lump<tmpw->cnt)) return NULL;
  size=tmpw->dir[lump].size;
  if (size<sizeof(header) ||
	!WadRead(tmpw,header,tmpw->dir[lump].offset,sizeof(header)) ||
	*ptr(U16 *)) return NULL;
  cnt=*(ptr+2)(U16 *);
  if (cnt>size-sizeof(header)) return NULL;
  tmps=CAlloc(sizeof(Sound));
  try {
    tmps->cnt=cnt;
    if (cnt) {
      tmps->body=MAlloc(cnt);
      valid=WadRead(tmpw,tmps->body,tmpw->dir[lump].offset+sizeof(header),cnt);
    } else valid=TRUE;
  } catch {
    SoundDel(tmps);
  }
  if (valid) return tmps;
  SoundDel(tmps);
  return NULL;
}

I64 SoundPeriod(Sound *tmps,I64 sample)
{//Zero gates the speaker off; invalid tone bytes are silent.
  I64 tone;
  if (!tmps || !(0<=sample<tmps->cnt)) return 0;
  tone=tmps->body[sample];
  if (tone<TM_TONE_NUM) return tm_tone_periods[tone];
  return 0;
}
