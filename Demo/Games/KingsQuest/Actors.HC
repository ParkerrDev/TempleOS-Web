I64 kq_dx[9]={0,0,1,1,1,0,-1,-1,-1};
I64 kq_dy[9]={0,-1,-1,0,1,1,1,0,-1};
U8 kq_loop2[9]={1,0,1,1,1,1,0,0,0};
U8 kq_loop4[9]={2,3,1,1,1,2,0,0,0};

I64 KqDirection(I64 dx,I64 dy)
{
  I64 d;
  dx=SignI64(dx);dy=SignI64(dy);
  for (d=0;d<9;d++)
    if (kq_dx[d]==dx && kq_dy[d]==dy) return d;
  return 0;
}

I64 KqChase(KqActor *a,I64 x,I64 y,I64 rx,I64 ry)
{
  I64 dx=x-a->x,dy=y-a->y;
  rx=MaxI64(rx,a->step_x);ry=MaxI64(ry,a->step_y);
  if (dx>=rx) dx=1;else if (dx< -rx) dx=-1;else dx=0;
  if (dy>=ry) dy=1;else if (dy< -ry) dy=-1;else dy=0;
  return KqDirection(dx,dy);
}

I64 KqMoveDir(KqActor *a,I64 x,I64 y)
{
  I64 dx=x-a->x,dy=y-a->y;
  if (!dx && !dy) return 0;
  a->avoid_rx=a->step_x;a->avoid_ry=a->step_y;
  if (dx>a->step_x) dx=1;else if (dx< -a->step_x) dx=-1;else dx=0;
  if (dy>a->step_y) dy=1;else if (dy< -a->step_y) dy=-1;else dy=0;
  return KqDirection(dx,dy);
}

U8 kq_turn_x[9]={0,1,1,0,1,1,1,0,1};
U8 kq_turn_y[9]={0,0,1,1,1,0,1,1,1};
U8 kq_reverse[9]={0,8,7,6,5,4,3,2,1};

I64 KqFollow(I64 id)
{//Original six-phase obstacle detour.
  KqActor *a=&kq_actor[id],*ego=&kq_actor[0];
  I64 dir=a->dir,rx=a->distance,ry=a->distance;
  U8 *p,*q;
  Bool stopped=FALSE,rotate=FALSE,chase=FALSE;
  if (a->mode==15) {rx=5;ry=0;}
  if (a->mode==17) rx=0;
  if (a->mode==17 && !a->swoop) {
    if (a->last_x==a->x && a->last_y==a->y) {
      a->swoop=TRUE;kq_var[21]=0;
    } else {
      dir=KqMoveDir(a,a->target_x,0);
      goto follow_done;
    }
  }
  if (kq_var[6]==id) {
    if (a->mode==17) kq_var[6]=0;
    else {stopped=TRUE;goto follow_stop;}
  }
  if (a->barrier_detour) {
    if (kq_block_x) {
      if (ego->y<a->y) dir=1;
      else if (ego->y>a->y) dir=5;
      else if (ego->x<a->x) dir=7;else dir=3;
      goto follow_done;
    }
    if (kq_block_y) {
      if (ego->x<a->x) dir=7;
      else if (ego->x>a->x) dir=3;
      else if (ego->y<a->y) dir=1;else dir=5;
      goto follow_done;
    }
    a->barrier_detour=FALSE;
  }
  if (a->last_x==a->x && a->last_y==a->y) {
    if (!a->avoid_phase) {
      a->avoid_turn=!a->avoid_turn;a->avoid_phase=1;
    } else if (a->avoid_phase==3) a->avoid_phase=4;
    else a->avoid_phase=1;
    rotate=TRUE;
  }
  if (rotate) {
    if (a->avoid_turn) {if (dir<2) dir=8;else dir--;}
    else {if (dir>=8) dir=1;else dir++;}
  }
  switch (a->avoid_phase) {
    case 0:
      chase=TRUE;break;
    case 1:
      a->avoid_phase=2;a->avoid_count=1;a->avoid_length=1;
      a->avoid_rx=rx+kq_turn_x[dir];a->avoid_ry=ry+kq_turn_y[dir];
      break;
    case 2:
      if (a->avoid_count) a->avoid_count--;
      else {a->avoid_phase=3;chase=TRUE;}
      break;
    case 3:
      a->avoid_length=1;a->avoid_phase=0;chase=TRUE;break;
    case 4:
      dir=kq_reverse[dir];a->avoid_phase=5;
      a->avoid_count=a->avoid_length;break;
    case 5:
      if (a->avoid_count) a->avoid_count--;
      else {
	a->avoid_rx+=kq_turn_x[dir];a->avoid_ry+=kq_turn_y[dir];
	a->avoid_turn=!a->avoid_turn;a->avoid_phase=2;
	a->avoid_length=(a->avoid_length+1)&255;
	a->avoid_count=a->avoid_length-1;
	if (a->avoid_turn) {if (dir<2) dir=8;else dir--;}
	else {if (dir>=8) dir=1;else dir++;}
      }
      break;
  }
  if (chase) {
    a->avoid_rx=MaxI64(rx,a->step_x);a->avoid_ry=MaxI64(ry,a->step_y);
    dir=KqChase(a,ego->x,ego->y,rx,ry);
    if (!dir) stopped=TRUE;
    else if (a->mode==17) {
      if (a->y+a->step_y+a->distance>ego->y && kq_var[21]) {
	if (kq_var[21]==id) stopped=TRUE;
	kq_var[21]=0;
      }
      p=KqCel(a->view,a->loop,a->cel);
      q=KqCel(ego->view,ego->loop,ego->cel);
      if (!stopped && p && q && a->y>=ego->y-q[0]-1 &&
	    a->x<=ego->x+q[1]-1 && ego->x<=a->x+p[1]-1) {
	kq_var[6]=id;stopped=TRUE;
      }
      if (!stopped && ego->y-a->y<a->distance-a->step_y) {
	if (a->x<ego->x) dir=2;else dir=8;
      }
    }
  }
follow_stop:
  if (stopped) {
    if (a->mode==17) {
      a->swoop=FALSE;a->flight_side=!a->flight_side;
      if (a->flight_side) a->target_x=0;else a->target_x=150;
      dir=KqMoveDir(a,a->target_x,0);
    } else {
      kq_var[6]=id;dir=0;
      if (a->mode==15) a->flags=0;
      a->mode=0;
    }
  }
follow_done:
  a->last_x=a->x;a->last_y=a->y;
  return dir;
}

U0 KqActorTick(I64 id)
{
  KqActor *a=&kq_actor[id];
  U8 *v,*p;
  I64 dx,dy,x,y,dir,edge=0,width=1,loop,n;
  Bool moved=FALSE,blocked=FALSE;
  if (!a->loaded || !a->visible) return;
  if (++a->tick<a->delay) return;
  a->tick=0;dir=a->mode;
  if (!id && kq_control && !kq_game_over) dir=kq_dir;
  if (dir>=12) {
    switch (dir) {
      case 12:
      case 15:
      case 17:
	dir=KqFollow(id);break;
      case 13:
	if (a->y>=a->target_y) {
	  kq_var[8]=1;dir=0;a->mode=0;
	  if (!id) kq_control=TRUE;
	} else {dir=5;a->step_y=4;}
	break;
      case 14:
	dir=KqMoveDir(a,a->target_x,a->target_y);
	if (!dir) {
	  kq_var[8]=1;a->mode=0;
	  if (!id) kq_control=TRUE;
	}
	break;
      case 16:
	dir=a->dir;
	if (!dir || !(RandU16%24)) dir=RandU16%8+1;
	break;
    }
  }
  if (!(0<=dir<=8)) dir=0;
  a->last_x=a->x;a->last_y=a->y;
  a->dir=dir;v=KqView(a->view);
  if (dir && !a->loop_lock && v) {
    loop=a->loop;
    if (v[2]==2) loop=kq_loop2[dir];
    if (v[2]==4) loop=kq_loop4[dir];
    a->loop=loop;
  }
  a->loop_lock=FALSE;
  p=KqCel(a->view,a->loop,a->cel);
  if (p) width=p[1];
  dx=kq_dx[dir]*a->step_x;dy=kq_dy[dir]*a->step_y;
  x=a->x+dx;y=a->y+dy;
  if (y<40) {edge=3;y=a->y;}
  if (y>=166) {edge=4;y=a->y;}
  if (x<=1) {edge=1;x=a->x;}
  if (x+width-1>=158) {edge=2;x=a->x;}
  if (edge) {
    if (!id) kq_var[3]=edge;
    else {kq_var[21]=id;kq_var[22]=edge;}
  }
  if (!a->block) {
    if (kq_block_x && kq_block_x-kq_block_left<=a->x<=kq_block_x &&
	  2<=dir<=4) blocked=TRUE;
    if (kq_block_x && kq_block_x<=a->x<=kq_block_x+kq_block_right &&
	  6<=dir<=8) blocked=TRUE;
    if (kq_block_y && kq_block_y-kq_block_top<=a->y<=kq_block_y &&
	  4<=dir<=6) blocked=TRUE;
    if (kq_block_y && kq_block_y<=a->y<=kq_block_y+kq_block_bottom &&
	  (dir==1 || dir==2 || dir==8)) blocked=TRUE;
  }
  if (blocked) a->barrier_detour=TRUE;
  if (!blocked && 0<=x<KQ_W-width && 0<=y<KQ_H &&
	KqWalk(id,x,y)) {
    moved=x!=a->x || y!=a->y;a->x=x;a->y=y;
  } else {
    if (a->mode==16) a->dir=0;
    if (a->mode==13) {
      a->mode=0;a->dir=0;kq_var[8]=1;
      if (!id) kq_control=TRUE;
    }
  }
  p=KqLoop(a->view,a->loop);
  if (!p) return;
  n=p[3];
  if (a->cel>=n && a->cycle!=2) a->cel=n-1;
  switch (a->cycle) {
    case 0:
      if (moved || id || kq_cycle_all) a->cel=(a->cel+1)%n;
      break;
    case 2:
      if (a->cel>0) a->cel--;
      else {a->cycle=1;kq_var[8]=1;}
      break;
    case 4:
      a->cycle=3;break;
    case 3:
      if (a->cel<n-1) a->cel++;
      else {
	a->cycle=1;kq_var[8]=1;
	if (!id) {kq_control=TRUE;kq_cycle_all=FALSE;}
      }
      break;
    case 5:
      if (a->cel<n-1) a->cel++;
      else {
	KqActorSet(0,0);a->loop=a->saved_loop;
	a->cel=a->saved_cel;a->cycle=7;a->mode=3;
	a->step_x=a->jump_dx;kq_var[26]=0;kq_var[8]=1;
      }
      break;
    case 7:
      a->cycle=1;a->mode=0;a->dir=0;a->flags=0;
      p=KqLoop(a->view,a->loop);
      a->step_x=MaxI64(1,p[0]);a->step_y=MaxI64(1,p[1]);
      if (!id) {kq_control=TRUE;kq_cycle_all=FALSE;}
      break;
  }
}

U0 KqPaint()
{
  I64 i,j,n=0,order[111],v,painted;
  KqActor *a;
  MemCpy(kq_pixels,kq_pic,KQ_PIXELS);
  for (i=0;i<111;i++)
    if (kq_actor[i].loaded && kq_actor[i].visible) {
      j=n;
      while (j && KqPriority(&kq_actor[order[j-1]])>
	    KqPriority(&kq_actor[i])) {order[j]=order[j-1];j--;}
      order[j]=i;n++;
    }
  for (i=0;i<n;i++) {
    v=order[i];a=&kq_actor[v];
    if (v || !kq_var[44]) {
      painted=KqSprite(a->view,a->loop,a->cel,a->x,a->y,KqPriority(a));
      if (!v) kq_var[7]=!painted;
    }
  }
  KqScale;
}
