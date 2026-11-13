I64 tm_song_writes=0,tm_song_gate=0,tm_song_period=0,tm_song_low=0;

U0 TmSongOut(I64 port,I64 value)
{
  if (port==0x43) tm_song_low=TRUE;
  else if (port==0x42) {
    if (tm_song_low) tm_song_period=value&255;
    else tm_song_period|=(value&255)<<8;
    tm_song_low=!tm_song_low;
  } else if (port==0x61) {
    tm_song_gate=value&3;
    tm_song_writes++;
  }
  OutU8(port,value);
}
