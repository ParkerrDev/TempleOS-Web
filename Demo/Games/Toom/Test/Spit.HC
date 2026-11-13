U0 TmSpitTest()
{
  I64 *body=FileRead("C:/ORACLE/SPIT.BIN"),*row,i,j,out[9],used,old_tics;
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Map *map=RoomsNew(FALSE);
  World *world=WorldNew(map,data);
  Motion *motion=MotionNew(world);
  Sectors *sectors=SectorsNew(motion);
  Specials *specials=SpecialsNew(sectors);
  Enemies *enemies=EnemiesNew(specials);
  Brain *brain=BrainNew(enemies);
  Actor *source=tm_spit_source=WorldSpawn(world,TM_MT_BOSSSPIT,0,0),
	*cube=tm_spit_cube=WorldSpawn(world,TM_MT_SPAWNSHOT,0,0);
  if (!body || !data) throw('Files');
  for (i=0;i<32;i++) tm_spit_targets[i]=
	WorldSpawn(world,TM_MT_BOSSTARGET,0,0);
  BrainAwake(brain,source); motion->sound=&TmSpitSound;
  old_tics=data->state[cube->state].tics; used=Fs->data_heap->used_u8s;
  for (i=0,row=body+1;i<body[0];i++,row+=16) {
    brain->cnt=row[0]; brain->on=row[1]; world->skill=row[2];
    for (j=0;j<32;j++) tm_spit_targets[j]->y=row[3];
    cube->vy=row[4]; data->state[cube->state].tics=row[5];
    cube->tics=1; cube->reaction=-17; cube->target=source->id;
    world->random=row[6]; tm_spit_spawns=tm_spit_sounds=0;
    tm_spit_selected=tm_spit_sound=-1; BrainSpit(brain,source);
    out[0]=brain->on; out[1]=brain->easy; out[2]=tm_spit_spawns;
    out[3]=tm_spit_selected; out[4]=-1;
    for (j=0;j<32;j++) if (cube->target==tm_spit_targets[j]->id) out[4]=j;
    out[5]=cube->reaction; out[6]=tm_spit_sounds; out[7]=tm_spit_sound;
    out[8]=world->random;
    for (j=0;j<9;j++) if (out[j]!=row[7+j]) {
      "SPIT %d FIELD %d GOT %d EXPECTED %d\n",i,j,out[j],row[7+j];
      throw('Spit');
    }
    if (Fs->data_heap->used_u8s!=used) throw('Alloc');
    tm_spit_cases++;
  }
  data->state[cube->state].tics=old_tics;
  BrainDel(brain); EnemiesDel(enemies); SpecialsDel(specials);
  SectorsDel(sectors); MotionDel(motion); WorldDel(world); MapDel(map);
  GameDataDel(data); Free(body); tm_spit_done=1;
  "SPIT %d DECISIONS BAD 0\n",tm_spit_cases;
}

TmSpitTest;
