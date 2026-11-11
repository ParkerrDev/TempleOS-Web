I64 tm_bank_done=0,tm_bank_cases=0,tm_bank_faults=0;

I64 TmBankHash(U8 *src,I64 size)
{
  I64 i,res=2166136261;
  for (i=0;i<size;i++) res=(res^src[i])*16777619&0xFFFFFFFF;
  return res;
}

U0 TmBankTest()
{
  I64 used=Fs->data_heap->used_u8s,size,phase,i,n,lump,cnt,hash,heap,
	read_bytes,expected,fail,mode,old_size,*body,*ptr;
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Wad *wad;
  SoundBank *bank;
  Sound *sound,*again;
  Bool loaded,caught;
  body=FileRead("C:/ORACLE/BANK.BIN",&size); ptr=body;
  if (!data || !body || size!=16+2*TM_SND_NUM*32 ||
	*ptr++!=2 || *ptr++!=TM_SND_NUM) throw('Files');
  if (SoundBankGet(NULL,1) || SoundIndex(-1) || SoundIndex(I64_MAX) ||
	SoundIndex(TM_SND_NUM)) throw('Bounds');
  for (phase=1;phase<=2;phase++) {
    if (phase==1) wad=WadNew("C:/ORACLE/PHASE1.WAD");
    else wad=WadNew("C:/ORACLE/PHASE2.WAD");
    if (!wad) throw('Wad');
    heap=Fs->data_heap->used_u8s;
    for (i=0;i<2;i++) {
      caught=FALSE;
      try {
	if (i) SoundBankNew(wad,NULL);
	else SoundBankNew(NULL,data);
      } catch {
	if (Fs->except_ch=='Owner') caught=Fs->catch_except=TRUE;
      }
      if (!caught || Fs->data_heap->used_u8s!=heap) throw('Owner');
      tm_bank_faults++;
    }
    read_bytes=wad->read_bytes;
    bank=SoundBankNew(wad,data);
    if (wad->read_bytes!=read_bytes) throw('Eager');
    for (i=0;i<TM_SND_NUM;i++) {
      n=*ptr++; lump=*ptr++; cnt=*ptr++; hash=*ptr++;
      if (SoundIndex(i)!=n) throw('Index');
      loaded=bank->loaded[n]; read_bytes=wad->read_bytes;
      sound=SoundBankGet(bank,i);
      expected=0;
      if (cnt>=0) {
	if (!sound || sound->cnt!=cnt ||
	      TmBankHash(sound->body,cnt)!=hash || sound!=bank->sound[n])
	  throw('Body');
	if (!loaded) expected=4+cnt;
      } else if (sound) throw('Missing');
      if (wad->read_bytes-read_bytes!=expected ||
	    n && !bank->loaded[n] || !n && bank->loaded[0]) throw('Lazy');
      if (lump>=0 && lump>=wad->cnt) throw('Lump');
      read_bytes=wad->read_bytes;
      again=SoundBankGet(bank,i);
      if (again!=sound || wad->read_bytes!=read_bytes) throw('Repeat');
      tm_bank_cases++;
    }
    SoundBankDel(bank);
    if (Fs->data_heap->used_u8s!=heap) throw('Heap');
    bank=NULL; caught=FALSE; tm_sound_fail=1; tm_sound_calls=0;
    try {
      bank=SoundBankNew(wad,data);
    } catch {
      if (Fs->except_ch=='SndTest') caught=Fs->catch_except=TRUE;
    }
    if (!caught || bank || Fs->data_heap->used_u8s!=heap) throw('NewFail');
    tm_bank_faults++; tm_sound_fail=0;
    bank=SoundBankNew(wad,data); heap=Fs->data_heap->used_u8s;
    for (mode=0;mode<2;mode++) for (fail=1;fail<=4;fail++) {
      sound=NULL; caught=FALSE;
      tm_sound_read_fail=mode; tm_sound_fail=fail; tm_sound_calls=0;
      try {
	sound=SoundBankGet(bank,TM_SFX_PISTOL);
      } catch {
	if (mode && (fail==1 || fail==4)) {
	  if (Fs->except_ch=='Sound') caught=Fs->catch_except=TRUE;
	} else if (Fs->except_ch=='SndTest') caught=Fs->catch_except=TRUE;
      }
      if (!caught || sound || bank->loaded[TM_SFX_PISTOL] ||
	    bank->sound[TM_SFX_PISTOL] || Fs->data_heap->used_u8s!=heap)
	throw('Unwind');
      tm_bank_faults++;
    }
    tm_sound_fail=0; tm_sound_read_fail=FALSE;
    lump=LumpFind(wad,"DPPISTOL");
    old_size=wad->dir[lump].size; wad->dir[lump].size=3;
    caught=FALSE;
    try {
      SoundBankGet(bank,TM_SFX_PISTOL);
    } catch {
      if (Fs->except_ch=='Sound') caught=Fs->catch_except=TRUE;
    }
    wad->dir[lump].size=old_size;
    if (!caught || bank->loaded[TM_SFX_PISTOL] ||
	  Fs->data_heap->used_u8s!=heap) throw('Invalid');
    tm_bank_faults++;
    sound=SoundBankGet(bank,TM_SFX_PISTOL); read_bytes=wad->read_bytes;
    again=SoundBankGet(bank,TM_SFX_PISTOL);
    if (!sound || again!=sound || wad->read_bytes!=read_bytes) throw('Retry');
    SoundBankDel(bank); WadDel(wad);
  }
  if (ptr!=body+size/8) throw('Tail');
  GameDataDel(data); Free(body);
  if (Fs->data_heap->used_u8s!=used) throw('Cleanup');
  tm_bank_done=1;
  "SOUND BANK %d CASES %d FAULTS LAZY NAMES HEAP BAD 0\n",
	tm_bank_cases,tm_bank_faults;
}

TmBankTest;
