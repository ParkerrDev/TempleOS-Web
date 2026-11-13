Wad *bench_wad;
GameData *bench_data;
Map *bench_map;
Graphics *bench_gr;
View *bench_view;
Sprites *bench_sprites;
World *bench_world;
CDC *bench_dc;
I64 bench_stats[6];

U0 BenchInit(U8 *wad_path,U8 *data_path,U8 *map_name)
{
  Actor *player;
  bench_wad=WadNew(wad_path);
  bench_data=GameDataNew(data_path);
  bench_map=MapNew(bench_wad,map_name);
  bench_gr=GraphicsNew(bench_wad);
  bench_view=ViewNew(bench_map,bench_gr);
  bench_sprites=SpritesNew(bench_wad,bench_data);
  bench_world=WorldNew(bench_map,bench_data);
  bench_dc=DCNew(TM_VIEW_WIDTH*2,TM_VIEW_HEIGHT*2);
  if (!bench_view || !bench_sprites || !bench_dc) throw('Files');
  WorldLoadThings(bench_world);
  player=WorldActorGet(bench_world,bench_world->player);
  if (!player) throw('Player');
  bench_view->x=player->x/65536.0;
  bench_view->y=player->y/65536.0;
  bench_view->z=player->z/65536.0+41;
  bench_view->angle=player->angle*2*pi/4294967296.0;
}

U0 BenchPose(I64 n)
{
  Actor *player=WorldActorGet(bench_world,bench_world->player);
  bench_view->angle=player->angle*2*pi/4294967296.0+n*pi/4;
}

U0 BenchDraw(I64 cnt=1)
{
  I64 i,id;
  Actor *tmpa;
  for (i=0;i<cnt;i++) {
    ViewDraw(bench_view);
    ViewMasked(bench_view);
    id=bench_world->first;
    while (tmpa=WorldActorGet(bench_world,id,FALSE)) {
      if (tmpa->id!=bench_world->player)
	SpriteDraw(bench_view,bench_sprites,tmpa);
      id=tmpa->tick_next;
    }
    ViewBlot(bench_view,bench_dc);
  }
}

U0 BenchStats()
{
  I64 i,hash=2166136261;
  for (i=0;i<TM_VIEW_WIDTH*TM_VIEW_HEIGHT*4;i++) {
    hash=(hash^bench_dc->body[i])*16777619;
    hash=hash.u32[0];
  }
  bench_stats[0]=hash;
  bench_stats[1]=bench_wad->read_bytes;
  bench_stats[2]=bench_gr->cache_size;
  bench_stats[3]=bench_sprites->cache_size;
  bench_stats[4]=bench_world->actor_cnt;
  bench_stats[5]=bench_view->masked_cnt;
}

U0 BenchDump()
{
  I64 i,n=TM_VIEW_WIDTH*TM_VIEW_HEIGHT*4;
  U8 *out=MAlloc(n*2+1),*hex="0123456789ABCDEF";
  for (i=0;i<n;i++) {
    out[i*2]=hex[bench_dc->body[i]>>4];
    out[i*2+1]=hex[bench_dc->body[i]&15];
  }
  out[n*2]=0;
  "PIX %s\n",out;
  Free(out);
}

U0 BenchDel()
{
  DCDel(bench_dc); WorldDel(bench_world); ViewDel(bench_view);
  SpritesDel(bench_sprites); GraphicsDel(bench_gr); MapDel(bench_map);
  GameDataDel(bench_data); WadDel(bench_wad);
}
