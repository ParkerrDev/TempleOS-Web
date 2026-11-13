U0 TmEnemyDecisions()
{
  I64 *body=FileRead("C:/ORACLE/ENEMY.BIN"),*row,i,j,result,out[17],used;
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Map *map=RoomsNew(FALSE);
  World *world=WorldNew(map,data);
  Player player;
  Motion *motion=MotionNew(world,&player);
  Sectors *sectors=SectorsNew(motion);
  Specials *specials=SpecialsNew(sectors);
  Enemies *enemies=EnemiesNew(specials);
  Actor *actor,*p,*h,*targets[3];
  ActorInfo *info;
  if (!body || !data) throw('Files');
  MemSet(&player,0,sizeof(Player));
  actor=tm_enemy_actor=WorldSpawn(world,TM_MT_POSSESSED,0,0);
  p=tm_enemy_player=WorldSpawn(world,TM_MT_PLAYER,64*65536,0);
  h=tm_enemy_heard=WorldSpawn(world,TM_MT_PLAYER,-64*65536,0);
  targets[0]=NULL; targets[1]=p; targets[2]=h;
  world->player=p->id; motion->sound=&TmEnemySound;
  used=Fs->data_heap->used_u8s;
  for (i=0,row=body+1;i<body[0];i++,row+=36) {
    p->x=row[2]; p->y=row[3]; h->x=-row[2]; h->y=row[3];
    data->info[TM_MT_PLAYER].radius=row[5];
    actor->type=row[1]; info=data->info+actor->type;
    info->melee=row[6]; info->see_snd=row[16]; info->see=99;
    actor->reaction=row[7]; actor->flags=row[8];
    p->flags=h->flags=row[9]; actor->lastlook=row[10];
    actor->threshold=57; actor->state=77; actor->angle=row[14];
    actor->target=enemies->sound[actor->sector]=0;
    if (row[4]) actor->target=targets[row[4]]->id;
    if (row[17]) enemies->sound[actor->sector]=targets[row[17]]->id;
    player.health=row[13]; tm_enemy_sight=row[12]; tm_enemy_angle=row[15];
    world->random=row[18]; tm_enemy_sight_calls=tm_enemy_angle_calls=0;
    tm_enemy_dx=tm_enemy_dy=tm_enemy_state_calls=tm_enemy_sounds=0;
    tm_enemy_sound=tm_enemy_origin=-1; result=-1;
    switch (row[0]) {
      case 0: result=EnemyMelee(enemies,actor); break;
      case 1: result=EnemyMissile(enemies,actor); break;
      case 2: result=EnemyPlayer(enemies,actor,row[11]); break;
      case 3: EnemyFace(enemies,actor); break;
      case 4: EnemyLook(enemies,actor); break;
      default: throw('Op');
    }
    out[0]=result; out[1]=TmEnemyKind(WorldActorGet(world,actor->target));
    out[2]=actor->flags; out[3]=actor->angle; out[4]=actor->lastlook;
    out[5]=actor->threshold; out[6]=actor->state; out[7]=tm_enemy_sound;
    out[8]=tm_enemy_origin; out[9]=world->random;
    out[10]=tm_enemy_sight_calls; out[11]=tm_enemy_angle_calls;
    out[12]=tm_enemy_dx; out[13]=tm_enemy_dy; out[14]=tm_enemy_state_calls;
    out[15]=(world->random-row[18])&255; out[16]=tm_enemy_sounds;
    for (j=0;j<17;j++) if (out[j]!=row[19+j]) {
      "ENEMY %d OP %d FIELD %d GOT %d EXPECTED %d\n",
	    i,row[0],j,out[j],row[19+j];
      throw('Enemy');
    }
    tm_enemy_cases++;
  }
  if (Fs->data_heap->used_u8s!=used) throw('Alloc');
  EnemiesDel(enemies); SpecialsDel(specials); SectorsDel(sectors);
  MotionDel(motion); WorldDel(world); MapDel(map); GameDataDel(data);
  Free(body); tm_enemy_done=1;
  "ENEMY %d DECISIONS BAD 0\n",tm_enemy_cases;
}

TmEnemyDecisions;
