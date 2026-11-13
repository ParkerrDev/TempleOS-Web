I64 tm_cast_cases=0,tm_cast_ticks=0,tm_cast_done=0,tm_cast_sounds=0,
	tm_cast_hash=0,tm_cast_events=0;

U0 TmCastSnd(I64 n,U8 *context)
{
  Cast *tmpc=context;
  I64 i,values[8];
  values[0]=n; values[1]=tmpc->num; values[2]=tmpc->state;
  values[3]=tmpc->frames; values[4]=tmpc->death;
  values[5]=tmpc->attacking; values[6]=tmpc->tics;
  values[7]=tmpc->on_melee;
  for (i=0;i<8;i++) tm_cast_hash=(tm_cast_hash*33+values[i])&0xFFFFFFFF;
  tm_cast_sounds++; tm_cast_events++;
}

U0 TmCastTest()
{
  I64 *data=FileRead("C:/ORACLE/CAST.BIN"),*ptr,i,j,start,res;
  GameData *tmpd=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Cast cast,muted;
  if (!data || !tmpd || data[0]!=102 || data[1]!=1500 || data[2]!=12)
    throw('Fixture');
  ptr=data+3;
  for (i=0;i<data[0];i++) {
    start=*ptr; ptr+=2;
    CastStart(&cast,tmpd,&TmCastSnd,&cast);
    CastStart(&muted,tmpd);
    if (cast.num || cast.death || cast.frames || cast.on_melee ||
	  cast.attacking || cast.state!=tmpd->info[tm_cast_types[0]].see ||
	  cast.tics!=tmpd->state[cast.state].tics)
      throw('Start');
    cast.num=muted.num=start;
    cast.state=muted.state=tmpd->info[tm_cast_types[start]].see;
    cast.tics=muted.tics=tmpd->state[cast.state].tics;
    for (j=0;j<data[1];j++) {
      tm_cast_sounds=tm_cast_hash=0; res=-1;
      if (ptr[0]!=-1) {
	res=CastKey(&cast,ptr[0]);
	if (CastKey(&muted,ptr[0])!=res) throw('Muted');
      }
      CastTick(&cast); CastTick(&muted);
      if (res!=ptr[1] || cast.num!=ptr[2] || cast.state!=ptr[3] ||
	    cast.tics!=ptr[4] || cast.death!=ptr[5] || cast.frames!=ptr[6] ||
	    cast.on_melee!=ptr[7] || cast.attacking!=ptr[8] ||
	    tm_cast_sounds!=ptr[9] || tm_cast_hash!=ptr[10] ||
	    tm_cast_types[cast.num]!=ptr[11]) {
	"CAST FAIL %d %d STATE %d WANT %d\n",i,j,cast.state,ptr[3];
	throw('Cast');
      }
      if (cast.num!=muted.num || cast.state!=muted.state ||
	    cast.tics!=muted.tics || cast.death!=muted.death ||
	    cast.frames!=muted.frames || cast.on_melee!=muted.on_melee ||
	    cast.attacking!=muted.attacking) throw('Silent');
      ptr+=data[2]; tm_cast_ticks++;
    }
    tm_cast_cases++;
  }
  GameDataDel(tmpd); Free(data);
}

U0 TmCastHeap()
{
  I64 used=Fs->data_heap->used_u8s;
  TmCastTest;
  if (Fs->data_heap->used_u8s!=used) throw('Cleanup');
  tm_cast_done=1;
  "CAST %d CASES %d TICS %d SOUNDS BAD 0\n",
	tm_cast_cases,tm_cast_ticks,tm_cast_events;
}

TmCastHeap;
