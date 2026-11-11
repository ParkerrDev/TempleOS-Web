U0 TmAudioCreateTest()
{
  I64 used=Fs->data_heap->used_u8s,i;
  Play *play=NULL;
  Bool caught;
  play=PlayNew("C:/ORACLE/FREEDOOM.WAD","C:/ORACLE/TMDATA.BIN");
  if (tm_audio_allocs!=2) throw('Count');
  PlayDel(play); play=NULL;
  if (Fs->data_heap->used_u8s!=used) throw('Base');
  for (i=1;i<=2;i++) {
    tm_audio_allocs=0; tm_audio_alloc_fail=i; caught=FALSE;
    try {
      play=PlayNew("C:/ORACLE/FREEDOOM.WAD","C:/ORACLE/TMDATA.BIN");
    } catch {
      if (Fs->except_ch=='SndAlloc') caught=Fs->catch_except=TRUE;
    }
    if (!caught || play || tm_audio_allocs!=i ||
	  Fs->data_heap->used_u8s!=used) throw('Cleanup');
  }
  "AUDIO PLAY CREATE 2 FAULTS HEAP BAD 0\n";
}
TmAudioCreateTest;
