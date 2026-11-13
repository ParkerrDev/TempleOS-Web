I64 tm_speaker_port=0xA0,tm_speaker_cnt=0;
I64 tm_speaker_ports[4096],tm_speaker_values[4096];

U8 TmSpeakerIn(I64 port)
{
  if (port!=0x61) throw('Port');
  return tm_speaker_port;
}

U0 TmSpeakerOut(I64 port,I64 value)
{
  if (tm_speaker_cnt>=4096) throw('Trace');
  tm_speaker_ports[tm_speaker_cnt]=port;
  tm_speaker_values[tm_speaker_cnt++]=value&255;
  if (port==0x61) tm_speaker_port=value&255;
}
