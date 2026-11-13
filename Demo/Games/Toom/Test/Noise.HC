I64 tm_noise_graphs=0,tm_noise_cases=0,tm_noise_done=0;

U0 TmNoiseTest()
{
  I64 *body=FileRead("C:/ORACLE/NOISE.BIN"),*row,i,j,k,n,lines,calls,used,
	graph,baseline;
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Map *map;
  World *world;
  Motion *motion;
  Sectors *sectors;
  Specials *specials;
  Enemies *enemies;
  Actor *target[3];
  if (!body || !data) throw('Files');
  baseline=Fs->data_heap->used_u8s;
  for (graph=0,row=body+1;graph<body[0];graph++) {
    n=*row++; lines=*row++; calls=*row++;
    map=RoomsNew(FALSE);
    Free(map->sector); Free(map->line); Free(map->side);
    map->sector_cnt=n; map->line_cnt=lines; map->side_cnt=lines*2;
    map->sector=CAlloc(n*sizeof(Sector));
    map->line=CAlloc(lines*sizeof(Line));
    map->side=CAlloc(lines*2*sizeof(Side));
    for (i=0;i<n;i++) {
      map->sector[i].floor=*row++; map->sector[i].ceil=*row++;
    }
    for (i=0;i<lines;i++) {
      map->side[i*2].sector=*row++; map->side[i*2+1].sector=*row++;
      map->line[i].flags=*row++;
      map->line[i].side[0]=i*2; map->line[i].side[1]=i*2+1;
      map->line[i].v2=1;
    }
    map->blockmap[20]=0; map->blockmap[21]=-1;
    world=WorldNew(map,data); motion=MotionNew(world);
    sectors=SectorsNew(motion); specials=SpecialsNew(sectors);
    enemies=EnemiesNew(specials);
    target[1]=WorldSpawn(world,TM_MT_PLAYER,64*65536,0);
    target[2]=WorldSpawn(world,TM_MT_PLAYER,-64*65536,0);
    for (i=0;i<n;i++) enemies->sound[i]=target[1]->id;
    used=Fs->data_heap->used_u8s; k=world->random;
    for (i=0;i<calls;i++) {
      target[1]->sector=*row++; j=*row++;
      EnemyNoise(enemies,target[j],target[1]);
      for (j=0;j<n;j++) {
	if (enemies->sound[j]!=target[row[j]]->id ||
	      enemies->depth[j]!=row[n+j]) {
	  "NOISE GRAPH %d CALL %d SECTOR %d\n",graph,i,j;
	  throw('Sound');
	}
      }
      row+=n*2; tm_noise_cases++;
      if (Fs->data_heap->used_u8s!=used || world->random!=k) throw('Alloc');
    }
    EnemiesDel(enemies); SpecialsDel(specials); SectorsDel(sectors);
    MotionDel(motion); WorldDel(world); MapDel(map); tm_noise_graphs++;
    if (Fs->data_heap->used_u8s!=baseline) throw('Cleanup');
  }
  GameDataDel(data); Free(body); tm_noise_done=1;
  "NOISE %d GRAPHS %d FLOODS BAD 0\n",tm_noise_graphs,tm_noise_cases;
}

TmNoiseTest;
