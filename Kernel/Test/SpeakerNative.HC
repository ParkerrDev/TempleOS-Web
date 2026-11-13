I64 speaker_read[275],speaker_count;

U0 SpeakerProbe()
{//Read the two independent speaker gates through native port instructions.
  I64 i,j;
  speaker_count=0;
  for (i=0;i<256;i++) {
    OutU8(0x61,i);
    speaker_read[speaker_count++]=InU8(0x61)&3;
  }
  for (i=0;i<4;i++)
    for (j=0;j<4;j++) {
      OutU8(0x61,i);
      OutU8(0x61,InU8(0x61)^j);
      speaker_read[speaker_count++]=InU8(0x61)&3;
    }
  Snd(60);
  speaker_read[speaker_count++]=InU8(0x61)&3;
  Snd;
  speaker_read[speaker_count++]=InU8(0x61)&3;
  Snd(60);
  speaker_read[speaker_count++]=InU8(0x61)&3;
  Snd;
  for (i=0;i<speaker_count;i++)
    "%d\n",speaker_read[i];
}
SpeakerProbe;
