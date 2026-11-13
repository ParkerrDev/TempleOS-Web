I64 tm_position_cases=0,tm_position_done=0;

U0 TmPositionTest()
{
  I64 *body=FileRead("C:/ORACLE/POSITION.BIN"),*row,i,j,out[9],used;
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Map *map=RoomsNew(FALSE);
  World *world=WorldNew(map,data);
  Actor *actor=WorldSpawn(world,TM_MT_TROOP,-64*65536,0),
	*other=WorldSpawn(world,TM_MT_TROOP,0,0);
  Collision *clip=world->collision;
  if (!body || !data) throw('Files');
  map->line[6].special=0; other->flags=TM_MF_SOLID;
  other->z=-256*65536; other->height=512*65536;
  used=Fs->data_heap->used_u8s;
  for (i=0,row=body+1;i<body[0];i++,row+=15) {
    map->sector[1].floor=row[0]; map->sector[1].ceil=row[1];
    actor->z=row[2]; actor->height=row[3]; actor->flags=row[4];
    other->active=row[5]==2; map->line[6].flags=4;
    if (row[5]==1) map->line[6].flags|=1;
    clip->line[6].back=1; if (row[5]==3) clip->line[6].back=-1;
    out[0]=WorldPosition(world,actor,0,0,,FALSE);
    out[1]=clip->floor; out[2]=clip->ceil; out[3]=clip->dropoff;
    out[4]=WorldPosition(world,actor,0,0);
    out[5]=clip->floor; out[6]=clip->ceil; out[7]=clip->dropoff;
    out[8]=clip->float_ok;
    for (j=0;j<9;j++) if (out[j]!=row[6+j]) {
      "POSITION %d FIELD %d GOT %d EXPECTED %d\n",i,j,out[j],row[6+j];
      throw('Position');
    }
    if (actor->x!=-64*65536 || actor->y ||
	  Fs->data_heap->used_u8s!=used) throw('Atomic');
    tm_position_cases++;
  }
  WorldDel(world); MapDel(map); GameDataDel(data); Free(body);
  tm_position_done=1;
  "POSITION %d CASES BAD 0\n",tm_position_cases;
}

TmPositionTest;
