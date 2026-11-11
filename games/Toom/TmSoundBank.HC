class SoundBank
{
  Wad *wad;
  GameData *data;
  Sound *sound[TM_SND_NUM];
  Bool loaded[TM_SND_NUM];
};

I64 SoundIndex(I64 n)
{//The PC-speaker driver omits these effects.
  if (!(0<n<TM_SND_NUM)) return 0;
  switch (n) {
    case TM_SFX_POSACT:
    case TM_SFX_BGACT:
    case TM_SFX_DMACT:
    case TM_SFX_DMPAIN:
    case TM_SFX_POPAIN:
    case TM_SFX_SAWIDL:
      return 0;
  }
  return n;
}

U0 SoundBankDel(SoundBank *tmpb)
{//Stop any borrowed stream before releasing the bank.
  I64 i;
  if (tmpb) {
    for (i=0;i<TM_SND_NUM;i++) SoundDel(tmpb->sound[i]);
    Free(tmpb);
  }
}

SoundBank *SoundBankNew(Wad *wad,GameData *data)
{
  SoundBank *res;
  if (!wad || !data) throw('Owner');
  res=CAlloc(sizeof(SoundBank));
  res->wad=wad; res->data=data;
  return res;
}

Sound *SoundBankGet(SoundBank *tmpb,I64 n)
{//A decoded clip is immutable and loaded only on its first request.
  U8 name[9];
  I64 lump;
  Sound *res=NULL;
  if (!tmpb || !(n=SoundIndex(n))) return NULL;
  if (tmpb->loaded[n]) return tmpb->sound[n];
  name[0]='D'; name[1]='P'; name[8]=0;
  MemCpy(name+2,tmpb->data->sound+n*8,6);
  lump=LumpFind(tmpb->wad,name);
  if (lump>=0 && !(res=SoundNew(tmpb->wad,lump))) throw('Sound');
  tmpb->sound[n]=res;
  tmpb->loaded[n]=TRUE;
  return res;
}
