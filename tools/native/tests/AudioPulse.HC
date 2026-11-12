U0 AudioPulse()
{
  I64 i,div,base=cnts.jiffies+JIFFY_FREQ;

  SleepUntil(base);
  OutU8(0x43,0xB6);
  for (i=0;i<420;i++) {
    if (i%3==2)
      OutU8(0x61,InU8(0x61)&~3);
    else {
      div=1250;
      if (i%3==1)
	div=625;
      OutU8(0x42,div&255);
      OutU8(0x42,div>>8);
      OutU8(0x61,InU8(0x61)|3);
    }
    SleepUntil(base+(i+1)*JIFFY_FREQ/140);
  }
  Snd(0);
}

Spawn(&AudioPulse);
