I64 tm_im_cases=0,tm_im_ticks=0,tm_im_done=0,tm_im_sounds=0,
      tm_im_sound_hash=0;

U0 TmIntermissionSnd(I64 n,U8 *context)
{
  if (context!=0x12345678) throw('Context');
  tm_im_sounds++;
  tm_im_sound_hash=(tm_im_sound_hash^n)*16777619&0xFFFFFFFF;
}

U0 TmIntermissionTest()
{
  Game game;
  Level level;
  World world;
  Intermission result;
  I64 *data,*row,*expected,size,i,j,k,cases,ticks,fields,got[13],
	used=Fs->data_heap->used_u8s;
  MemSet(&game,0,sizeof(Game)); MemSet(&level,0,sizeof(Level));
  MemSet(&world,0,sizeof(World)); game.level=&level; level.world=&world;
  data=FileRead("C:/ORACLE/INTER.BIN",&size);
  if (!data || size<24) throw('Header');
  try {
    cases=data[0]; ticks=data[1]; fields=data[2];
    if (cases!=144 || ticks!=640 || fields!=14 ||
	  size!=24+cases*(11+ticks*fields)*8) throw('Rows');
    row=data+3; level.episode=level.map_num=1;
    world.exit_rqst=TM_EXIT_NORMAL;
    for (i=0;i<cases;i++) {
      game.commercial=row[0];
      level.player.kills=row[1]; world.total_kills=row[2];
      level.player.items=row[3]; world.total_items=row[4];
      level.player.secrets=row[5]; world.total_secrets=row[6];
      world.tic=row[7]; level.player.attack_down=!!(row[10]&1);
      level.player.use_down=!!(row[10]&2);
      IntermissionStart(&result,&game,row[8]);
      result.sound=&TmIntermissionSnd; result.context=0x12345678;
      tm_im_sounds=0; tm_im_sound_hash=2166136261;
      expected=row+11;
      for (j=0;j<ticks;j++) {
	IntermissionTick(&result,expected[0]);
	got[0]=result.phase; got[1]=result.state; got[2]=result.wait;
	got[3]=result.tic; got[4]=result.shown_kills;
	got[5]=result.shown_items; got[6]=result.shown_secrets;
	got[7]=result.shown_time; got[8]=result.shown_par;
	got[9]=result.attack_down; got[10]=result.use_down;
	got[11]=tm_im_sounds; got[12]=tm_im_sound_hash;
	for (k=0;k<13;k++)
	  if (got[k]!=expected[k+1]) {
	    "INTERMISSION CASE %d TIC %d FIELD %d GOT %d WANT %d\n",
		  i,j,k,got[k],expected[k+1];
	    throw('Inter');
	  }
	expected+=fields; tm_im_ticks++;
      }
      row=expected; tm_im_cases++;
    }
  } catch {
    Free(data);
  }
  Free(data);
  if (Fs->data_heap->used_u8s!=used) throw('Heap');
  tm_im_done=1;
  "INTERMISSION %d CASES %d TICS BAD 0\n",tm_im_cases,tm_im_ticks;
}

TmIntermissionTest;
