U0 TmTouchTest()
{
  I64 i,j,n,*rows=FileRead("C:/ORACLE/TOUCH.BIN"),*row,kind,out[12];
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Map *map=RoomsNew(FALSE);
  World *world=WorldNew(map,data);
  Motion *motion=MotionNew(world);
  Actor *a=WorldSpawn(world,TM_MT_ROCKET,0,0),
	*b=WorldSpawn(world,TM_MT_TROOP,0,0),
	*c=WorldSpawn(world,TM_MT_PLAYER,64*65536,0);
  if (!data || !rows) throw('Files');
  n=*rows; row=rows+1;
  tm_touch_mover=a; tm_touch_other=b; tm_touch_owner=c; tm_touch_motion=motion;
  data->info[a->type].spawn=123;
  for (i=0;i<n;i++,row+=18) {
    a->flags=row[0]; b->flags=row[1]; world->random=row[2];
    data->info[a->type].damage=row[3]; a->target=0;
    if (row[4]==2) a->target=b->id;
    else if (row[4]) a->target=c->id;
    c->type=TM_MT_PLAYER; if (row[4]==3) c->type=TM_MT_TROOP;
    b->z=row[5]; a->z=0; a->radius=b->radius=20*65536;
    a->height=b->height=56*65536; a->state=456;
    a->vx=11; a->vy=-22; a->vz=33;
    tm_touch_damage_cnt=tm_touch_damage=tm_touch_source=0;
    tm_touch_pickups=tm_touch_states=0;
    kind=WorldContactKind(world,a,b,0,0);
    if (kind && kind!=TM_CONTACT_SOLID) MotionTouch(motion,a,b,kind);
    out[0]=!kind || kind==TM_CONTACT_PICKUP && !(b->flags&TM_MF_SOLID);
    out[1]=world->random; out[2]=tm_touch_damage_cnt;
    out[3]=tm_touch_damage; out[4]=tm_touch_source;
    out[5]=tm_touch_pickups; out[6]=tm_touch_states; out[7]=a->state;
    out[8]=a->flags; out[9]=a->vx; out[10]=a->vy; out[11]=a->vz;
    for (j=0;j<12;j++)
      if (out[j]!=row[6+j]) {
	"TOUCH %d FIELD %d GOT %d EXPECT %d\n",i,j,out[j],row[6+j];
	throw('Trace');
      }
    tm_touch_cases++;
  }
  MotionDel(motion); WorldDel(world); MapDel(map); GameDataDel(data);
  Free(rows); tm_touch_done=1;
  "TOUCH %d DECISIONS BAD 0\n",tm_touch_cases;
}

TmTouchTest;
