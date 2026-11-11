I64 tm_slide_cnt=0,tm_slide_done=0,tm_slide_cross=0;

U0 TmSlideCross(Actor *tmpa,I64 line,I64 side)
{
  if (line!=6 || side!=1 || tmpa->x<=0) throw('Cross');
  tm_slide_cross++;
}

U0 TmSlideTouch(Actor *tmpa,Actor *other,I64 kind)
{
  if (kind!=TM_CONTACT_PICKUP) throw('Touch');
  tmpa->active=other->active=FALSE;
}

U0 TmSlideAxis(GameData *tmpd,I64 sx,I64 sy,Bool turn)
{
  Map *tmpm=RoomsNew(FALSE);
  World *tmpw=WorldNew(tmpm,tmpd);
  Path *tmpp=PathNew(tmpw);
  I64 x=sx*100*65536,y=0,vx=sx*20*65536,vy=sy*10*65536,
	want_x=sx*7299060,want_y=sy*634880,want_vx=0,want_vy=sy*262150;
  Actor *tmpa;
  if (turn) {
    SwapI64(&x,&y); SwapI64(&vx,&vy);
    SwapI64(&want_x,&want_y); SwapI64(&want_vx,&want_vy);
  }
  tmpa=WorldSpawn(tmpw,TM_MT_PLAYER,x,y); tmpa->vx=vx; tmpa->vy=vy;
  if (WorldTryMove(tmpw,tmpa,x+vx,y+vy)) throw('Wall');
  WorldSlide(tmpw,tmpa,tmpp);
  if (tmpa->x!=want_x || tmpa->y!=want_y ||
	tmpa->vx!=want_vx || tmpa->vy!=want_vy ||
	!WorldPosition(tmpw,tmpa,tmpa->x,tmpa->y)) {
    "AXIS %d,%d,%d POS %d,%d VEL %d,%d\n",
	  sx,sy,turn,tmpa->x,tmpa->y,tmpa->vx,tmpa->vy;
    throw('Axis');
  }
  tm_slide_cnt++;
  PathDel(tmpp); WorldDel(tmpw); MapDel(tmpm);
}

U0 TmSlideCases(GameData *tmpd)
{
  Map *tmpm=RoomsNew(FALSE);
  World *tmpw=WorldNew(tmpm,tmpd);
  Path *tmpp=PathNew(tmpw);
  Actor *tmpa=WorldSpawn(tmpw,TM_MT_PLAYER,110*65536,90*65536),*other;
  I64 i,sx,sy,old_x,old_y;
  for (sx=-1;sx<=1;sx+=2)
    for (sy=-1;sy<=1;sy+=2)
      for (i=0;i<2;i++) TmSlideAxis(tmpd,sx,sy,i);
  tmpa->vx=10*65536; tmpa->vy=30*65536;
  WorldSlide(tmpw,tmpa,tmpp);
  if (tmpa->vx || tmpa->vy || tmpa->x>112*65536 || tmpa->y>112*65536 ||
	!WorldPosition(tmpw,tmpa,tmpa->x,tmpa->y)) throw('Corner');
  tm_slide_cnt++;
  WorldTryMove(tmpw,tmpa,112*65536,0);
  tmpa->vx=20*65536; tmpa->vy=10*65536;
  WorldSlide(tmpw,tmpa,tmpp);
  if (tmpa->x!=112*65536 || tmpa->y!=10*65536 || tmpa->vx ||
	tmpa->vy!=10*65536) throw('Flush');
  tm_slide_cnt++;
  WorldTryMove(tmpw,tmpa,0,0);
  other=WorldSpawn(tmpw,TM_MT_TROOP,48*65536,0);
  tmpa->vx=20*65536; tmpa->vy=10*65536;
  if (WorldTryMove(tmpw,tmpa,tmpa->vx,tmpa->vy)) throw('Actor');
  WorldSlide(tmpw,tmpa,tmpp);
  if (tmpa->x || tmpa->y!=10*65536) throw('StairY');
  tm_slide_cnt++;
  WorldRemove(tmpw,other); WorldTryMove(tmpw,tmpa,0,0);
  other=WorldSpawn(tmpw,TM_MT_TROOP,0,48*65536);
  tmpa->vx=10*65536; tmpa->vy=20*65536;
  WorldSlide(tmpw,tmpa,tmpp);
  if (tmpa->x!=10*65536 || tmpa->y) throw('StairX');
  tm_slide_cnt++;
  WorldRemove(tmpw,other);
  WorldTryMove(tmpw,tmpa,-28*65536,0);
  tmpm->sector[0].floor=25;
  tmpa->vx=20*65536; tmpa->vy=10*65536;
  WorldSlide(tmpw,tmpa,tmpp);
  if (tmpa->x!=-1089548 || tmpa->y!=634880 || tmpa->vx ||
	!WorldPosition(tmpw,tmpa,tmpa->x,tmpa->y)) throw('Step');
  tm_slide_cnt++;
  tmpm->sector[0].floor=0;
  tmpm->line[6].flags|=1;
  WorldTryMove(tmpw,tmpa,-28*65536,0);
  tmpa->vx=20*65536; tmpa->vy=10*65536;
  WorldSlide(tmpw,tmpa,tmpp);
  if (tmpa->x!=-1089548 || tmpa->y!=634880) throw('Flag');
  tm_slide_cnt++;
  tmpm->line[6].flags&=~1;
  tmpm->sector[0].ceil=55;
  WorldTryMove(tmpw,tmpa,-28*65536,0);
  tmpa->vx=20*65536; tmpa->vy=10*65536;
  WorldSlide(tmpw,tmpa,tmpp);
  if (tmpa->x!=-1089548 || tmpa->y!=634880) throw('Head');
  tm_slide_cnt++;
  tmpm->sector[0].ceil=128;
  WorldTryMove(tmpw,tmpa,-8*65536,100*65536);
  tmpa->vx=tmpa->vy=20*65536;
  WorldSlide(tmpw,tmpa,tmpp,NULL,&TmSlideCross);
  if (tm_slide_cross!=1 || tmpa->x<=0 || tmpa->y>112*65536) throw('Action');
  tm_slide_cnt++;
  other=WorldSpawn(tmpw,TM_MT_CLIP,108*65536,0);
  WorldTryMove(tmpw,tmpa,80*65536,0);
  tmpa->vx=40*65536; tmpa->vy=10*65536;
  old_x=tmpa->x; old_y=tmpa->y;
  WorldSlide(tmpw,tmpa,tmpp,&TmSlideTouch);
  if (tmpa->active || other->active || tmpa->x!=old_x || tmpa->y!=old_y)
    throw('Remove');
  tm_slide_cnt++;
  PathDel(tmpp); WorldDel(tmpw); MapDel(tmpm);
}

U0 TmSlideDiagonal(GameData *tmpd,I64 side)
{
  Map *tmpm=RoomsNew;
  World *tmpw;
  Path *tmpp;
  Actor *tmpa;
  tmpm->line_cnt=8;
  tmpm->line[7].v1=0; tmpm->line[7].v2=3;
  tmpm->line[7].side[1]=0xFFFF; tmpm->line[7].flags=0;
  tmpm->blockmap[28]=-1;
  if (side) SwapU16(&tmpm->line[7].v1,&tmpm->line[7].v2);
  tmpw=WorldNew(tmpm,tmpd); tmpp=PathNew(tmpw);
  tmpa=WorldSpawn(tmpw,TM_MT_PLAYER,30*65536,-30*65536);
  tmpa->vx=-10*65536; tmpa->vy=30*65536;
  if (side) {
    WorldTryMove(tmpw,tmpa,-30*65536,30*65536);
    tmpa->vx=-tmpa->vx; tmpa->vy=-tmpa->vy;
  }
  if (WorldTryMove(tmpw,tmpa,tmpa->x+tmpa->vx,tmpa->y+tmpa->vy))
    throw('DiagHit');
  WorldSlide(tmpw,tmpa,tmpp);
  if (!WorldPosition(tmpw,tmpa,tmpa->x,tmpa->y) ||
	AbsI64(tmpa->vx-tmpa->vy)>1024 || !tmpa->vx ||
	side && tmpa->vx>0 || !side && tmpa->vx<0) throw('Diagonal');
  tm_slide_cnt++;
  PathDel(tmpp); WorldDel(tmpw); MapDel(tmpm);
}

U0 TmSlideTest()
{
  GameData *tmpd=GameDataNew("C:/ORACLE/TMDATA.BIN");
  World world;
  ClipLine line;
  Actor actor;
  I64 *data=FileRead("C:/ORACLE/SLIDE.BIN"),*at=data,i,vx,vy;
  if (!tmpd || !data) throw('Files');
  MemSet(&world,0,sizeof(World)); MemSet(&actor,0,sizeof(Actor));
  MemSet(&line,0,sizeof(ClipLine)); world.data=tmpd;
  for (i=0;i<1024;i++,at+=8) {
    line.dx=at[0]; line.dy=at[1]; actor.x=at[2]; actor.y=at[3];
    vx=at[4]; vy=at[5]; SlideVector(&world,&actor,&line,&vx,&vy);
    if (vx!=at[6] || vy!=at[7]) {
      "VECTOR %d GOT %d,%d WANT %d,%d\n",i,vx,vy,at[6],at[7];
      throw('Vector');
    }
  }
  TmSlideCases(tmpd);
  TmSlideDiagonal(tmpd,0); TmSlideDiagonal(tmpd,1);
  "SLIDE %d CASES VECTORS 1024 BAD 0\n",tm_slide_cnt;
  Free(data); GameDataDel(tmpd); tm_slide_done=1;
}

TmSlideTest;
