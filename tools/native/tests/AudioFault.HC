U0 AudioFault()
{
  Sleep(1500);
  asm {
    DU8 0xD9,0xD1;
  }
}

OutU8(0x43,0xB6);
OutU8(0x42,1250&255);
OutU8(0x42,1250>>8);
OutU8(0x61,InU8(0x61)|3);
Spawn(&AudioFault);
