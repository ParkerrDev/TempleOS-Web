I64 tm_boss_cases=0,tm_boss_done=0,tm_boss_event,tm_boss_tag,
	tm_boss_kind,tm_boss_cnt;

Bool TmBossDoor(Sectors *,I64 tag,I64 type)
{
  tm_boss_event=1; tm_boss_tag=tag; tm_boss_kind=type; tm_boss_cnt++;
  return TRUE;
}

Bool TmBossFloor(Sectors *,I64 tag,I64 type,I64 line=-1)
{
  if (line!=-1) throw('Line');
  tm_boss_event=2; tm_boss_tag=tag; tm_boss_kind=type; tm_boss_cnt++;
  return TRUE;
}
