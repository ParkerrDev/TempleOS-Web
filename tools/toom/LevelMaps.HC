I64 tm_level_map_cases=0,tm_level_map_done=0;

U0 TmLevelMapsTest()
{
  I64 *rows=FileRead("C:/ORACLE/LVLMAPS.BIN"),*row,n,i,j,used,
	phase=-1,hash,actors=0,trace[408],*dst;
  U8 name[9];
  Bool commercial,stomp;
  Game *game=NULL;
  World *world;
  Texture *sky;
  if (!rows) throw('Files');
  used=Fs->data_heap->used_u8s; n=*rows; row=rows+1;
  if (n!=68) throw('Count');
  for (i=0;i<n;i++,row+=8) {
    if (phase!=row[0]) {
      GameDel(game); phase=row[0];
      if (phase==1)
	game=GameNew("C:/ORACLE/PHASE1.WAD","C:/ORACLE/TMDATA.BIN");
      else game=GameNew("C:/ORACLE/PHASE2.WAD","C:/ORACLE/TMDATA.BIN");
      commercial=phase==2;
      if (game->commercial!=commercial) throw('Phase');
      game->clock=12345;
    }
    GameLoad(game,row[1],row[2]); world=game->level->world;
    stomp=phase==2 && row[2]==30;
    if (world->actor_cnt!=row[3] || world->total_kills!=row[4] ||
	  world->total_items!=row[5] || world->total_secrets!=row[6] ||
	  world->tic || game->clock!=12345 || game->flags ||
	  game->level->specials->monsters_stomp!=stomp)
      throw('Map');
    MemSet(name,0,sizeof(name)); StrCpy(name,"SKY1"); name[3]='0'+row[7];
    sky=game->graphics->texture+game->level->view->sky;
    if (MemCmp(sky->def->name,name,8)) throw('Sky');
    hash=2166136261;
    for (j=0;j<world->slot_cap;j++)
      if (world->slot[j].actor)
	hash=(hash^world->slot[j].actor->type)*16777619&0xFFFFFFFF;
    dst=trace+i*6; dst[0]=phase; dst[1]=row[1]; dst[2]=row[2];
    dst[3]=world->actor_cnt; dst[4]=world->random; dst[5]=hash;
    actors+=world->actor_cnt; tm_level_map_cases++;
  }
  GameDel(game);
  if (Fs->data_heap->used_u8s!=used) throw('Cleanup');
  if (!FileWrite("C:/ORACLE/LVLTRACE.BIN",trace,sizeof(trace)))
    throw('Trace');
  for (i=0;i<n;i++) {
    dst=trace+i*6;
    "LEVEL MAP %d %d %d ACTORS %d RNG %d HASH %d\n",dst[0],dst[1],
	  dst[2],dst[3],dst[4],dst[5];
  }
  Free(rows); tm_level_map_done=1;
  "LEVEL MAPS %d ACTORS %d BAD 0\n",tm_level_map_cases,actors;
}

TmLevelMapsTest;
