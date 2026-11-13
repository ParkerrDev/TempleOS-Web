$BG,0$
$SP,"<ship_null>",BI=1$


$SP,"<ship_thrust>",BI=2$



$SP,"<ship_null2>",BI=3$


$SP,"<ship_thrust2>",BI=4$



$SP,"<Cargo>",BI=5$




$SP,"<Shot>",BI=6$

$SP,"<tiny_rock>",BI=7$


$SP,"<tiny_rock2>",BI=8$


$SP,"<small_rock>",BI=9$


$SP,"<small_rock2>",BI=10$



$SP,"<medium_rock>",BI=11$


$SP,"<medium_rock2>",BI=12$




$SP,"<large_rock>",BI=13$


$SP,"<large_rock2>",BI=14$


$BG$


#define CMD_NULL	0
#define CMD_SPIN_LEFT	1
#define CMD_SPIN_RIGHT	2
#define CMD_THRUST	3
#define CMD_FIRE	4
#define CMD_GAME_OVER	5
I64 cmd_code=CMD_NULL;

#define STARS_NUM	100
I64 stars_x[STARS_NUM],stars_y[STARS_NUM];

Bool bounce;

#define OT_SHIELD_SHIP		0
#define OT_NO_SHIELD_SHIP	1
#define OT_CARGO		2
#define OT_SHOT			3
#define OT_TINY_ROCK		4
#define OT_SMALL_ROCK		5
#define OT_MEDIUM_ROCK		6
#define OT_LARGE_ROCK		7
#define OT_TYPES_NUM		8

F64 radii[OT_TYPES_NUM]={15,15,30,7,5,11,20,26};

U8 *imgs[OT_TYPES_NUM*2]=
{$IB,"<ship_null>",BI=1$,	$IB,"<ship_thrust>",BI=2$,
$IB,"<ship_null2>",BI=3$,	$IB,"<ship_thrust2>",BI=4$,
$IB,"<cargo>",BI=5$,	$IB,"<cargo>",BI=5$,
$IB,"<shot>",BI=6$,	$IB,"<shot>",BI=6$,
$IB,"<tiny_rock>",BI=7$,	$IB,"<tiny_rock2>",BI=8$,
$IB,"<small_rock>",BI=9$,	$IB,"<small_rock2>",BI=10$,
$IB,"<medium_rock>",BI=11$,	$IB,"<medium_rock2>",BI=12$,
$IB,"<large_rock>",BI=13$,	$IB,"<large_rock2>",BI=14$
};

#define A_TRANSITION	-1
#define A_INACTIVE	0
#define A_ACTIVE	1

class Order2D2È
{
  F64 x,y,È;
  F64 DxDt,DyDt,DÈDt;
};

class Obj
{
  I32 active;
  I32 type;
  U8 *img;
  F64 mass,radius;
  F64 timeout;
};


#define O_SHIP		0
#define O_CARGO		1
#define O_OBJS_NUM	256

CMathODE *ode;
Order2D2È *o_state;
Obj *objs;

U0 ObjInit(I64 i, I64 type)
{
  objs[i].active=A_ACTIVE;
  objs[i].timeout=0;
  objs[i].type=type;
  objs[i].radius=radii[type];
  objs[i].img=imgs[type*2+i&1];
  objs[i].mass=objs[i].radius*objs[i].radius*objs[i].radius;
}

I64 last_obj_alloced=0;
I64 ObjAlloc(I64 type)
{
  while (objs[last_obj_alloced].active!=A_INACTIVE)
    last_obj_alloced=(last_obj_alloced+1)%O_OBJS_NUM;
  ObjInit(last_obj_alloced,type);
  return last_obj_alloced;
}

U0 DrawIt(CTask *task,CDC *dc)
{
  I64 i,x,y;

  task->text_attr=BLACK<<4+WHITE;

  dc->color=WHITE;
  for (i=0;i<STARS_NUM;i++)
    GrPlot(dc,stars_x[i],stars_y[i]);

  for (i=0;i<O_OBJS_NUM;i++) {
    if (objs[i].active==A_ACTIVE) {
      if (objs[i].timeout && objs[i].timeout<tS)
	objs[i].active=A_INACTIVE;
      else {
	x=o_state[i].x;
	y=o_state[i].y;

	if (x<0) {
	  x=GR_WIDTH-AbsI64(x)%GR_WIDTH;
	  o_state[i].x=x;
	} else if (x>GR_WIDTH) {
	  x%=GR_WIDTH;
	  o_state[i].x=x;
	}
	if (y<0) {
	  y=GR_HEIGHT-AbsI64(y)%GR_HEIGHT;
	  o_state[i].y=y;
	} else if (y>GR_HEIGHT) {
	  y%=GR_HEIGHT;
	  o_state[i].y=y;
	}
	switch (objs[i].type) {
	  case OT_SHIELD_SHIP:
	    if (cmd_code==CMD_THRUST && RandU16&0x8000)
	      Sprite3ZB(dc,x,y,0,imgs[OT_SHIELD_SHIP*2+1],o_state[i].È);
	    else
	      Sprite3ZB(dc,x,y,0,imgs[OT_SHIELD_SHIP*2],o_state[i].È);
	    break;
	  case OT_NO_SHIELD_SHIP:
	    if (cmd_code==CMD_THRUST && RandU16&0x8000)
	      Sprite3ZB(dc,x,y,0,imgs[OT_NO_SHIELD_SHIP*2+1],o_state[i].È);
	    else
	      Sprite3ZB(dc,x,y,0,imgs[OT_NO_SHIELD_SHIP*2],o_state[i].È);
	    break;
	  case OT_SHOT:
	  case OT_TINY_ROCK:
	  case OT_SMALL_ROCK:
	  case OT_MEDIUM_ROCK:
	  case OT_LARGE_ROCK:
	  case OT_CARGO:
	    Sprite3ZB(dc,x,y,0,objs[i].img,o_state[i].È);
	    break;
	}
      }
    }
  }
  dc->color=WHITE;
  GrPrint(dc,0,0,"Escort the cargo ship.");
}

U0 Init()
{
  I64 i,j;

  cmd_code=CMD_NULL;

  for (i=0;i<STARS_NUM;i++) {
    stars_x[i]=RandU16%GR_WIDTH;
    stars_y[i]=RandU16%GR_HEIGHT;
  }

  MemSet(objs,0,sizeof(Obj)*O_OBJS_NUM);
  MemSet(o_state,0,sizeof(Order2D2È)*O_OBJS_NUM);

  last_obj_alloced=0;
//Always #0=O_SHIP
  if (bounce)
    i=ObjAlloc(OT_SHIELD_SHIP);
  else
    i=ObjAlloc(OT_NO_SHIELD_SHIP);
  objs[i].mass=2.0*objs[i].radius*objs[i].radius*objs[i].radius;
  o_state[i].x=GR_WIDTH/2;
  o_state[i].y=GR_HEIGHT/2;

  //Always #1=O_CARGO
  i=ObjAlloc(OT_CARGO);
  objs[i].mass=0.5*objs[i].radius*objs[i].radius*objs[i].radius;
  o_state[i].x=0;
  o_state[i].DxDt=16.0;
  o_state[i].y=GR_HEIGHT/2;
  o_state[i].È=„/2;

  for (j=0;j<4;j++) {
    i=ObjAlloc(OT_LARGE_ROCK);
    o_state[i].x=RandU32%GR_WIDTH;
    o_state[i].y=RandU32%GR_HEIGHT;
    o_state[i].DxDt=RandI16/2000.0;
    o_state[i].DyDt=RandI16/2000.0;
    o_state[i].DÈDt=RandI16/25000.0;
    o_state[i].È=2*„*RandI16/16384.0;
  }
}

U0 MyDerivative(CMathODE *,F64,Order2D2È *state,Order2D2È *DstateDt)
{
  I64 i,j;
  F64 f,d,d1,dd,dx,dy;

  MemSet(DstateDt,0,sizeof(Order2D2È)*O_OBJS_NUM);
  for (i=0;i<O_OBJS_NUM;i++) {
    if (objs[i].active==A_ACTIVE) {
      DstateDt[i].x=state[i].DxDt;
      DstateDt[i].y=state[i].DyDt;
      DstateDt[i].È=state[i].DÈDt;
      for (j=0;j<O_OBJS_NUM;j++) {
	if (i!=j && objs[j].active==A_ACTIVE) {
	  dx=state[i].x-state[j].x;
	  dy=state[i].y-state[j].y;
	  dd=Sqr(dx)+Sqr(dy);
	  d=Sqrt(dd);

	  if (d) {
	    dx/=d;
	    dy/=d;
	  } else {
	    dx=0;
	    dy=0;
	  }

	  d1=objs[i].radius+objs[j].radius;
	  f=0;
	  if (dd<Sqr(d1)) {
	    if (bounce && objs[i].type!=OT_CARGO && objs[j].type!=OT_CARGO) {
	      f=Sqr(Sqr(Sqr(d1-Abs(d)+0.1))); //spring force
	      if (f>1000000.0) f=1000000.0;
	    }
	  } else
	    f=-2.5*objs[i].mass*objs[j].mass/(dd+1.0);

	  DstateDt[i].DxDt+=f*dx/objs[i].mass;
	  DstateDt[i].DyDt+=f*dy/objs[i].mass;
	}
      }
    }
  }
  switch (cmd_code) {
    case CMD_SPIN_LEFT:
      DstateDt[O_SHIP].DÈDt-=10.0;
      break;
    case CMD_SPIN_RIGHT:
      DstateDt[O_SHIP].DÈDt+=10.0;
      break;
    case CMD_THRUST:
      DstateDt[O_SHIP].DxDt+=100.0*Cos(state[O_SHIP].È-„/2.0);
      DstateDt[O_SHIP].DyDt+=100.0*Sin(state[O_SHIP].È-„/2.0);
      break;
  }

  DstateDt[O_CARGO].DxDt+=2.0*Cos(state[O_CARGO].È-„/2.0);
  DstateDt[O_CARGO].DyDt+=2.0*Sin(state[O_CARGO].È-„/2.0);
}

U0 Collision(I64 i,I64 j)
{
  I64 i2;
  switch (objs[i].type) {
    case OT_SHIELD_SHIP:
    case OT_NO_SHIELD_SHIP:
      if (!bounce) {
	cmd_code=CMD_GAME_OVER;
	objs[i].active=A_INACTIVE;
      }
      break;
    case OT_CARGO:
      cmd_code=CMD_GAME_OVER;
      objs[i].active=A_INACTIVE;
      break;
    case OT_TINY_ROCK:
      if (objs[j].type==OT_SHOT && !bounce)
	objs[i].active=A_INACTIVE;
      break;
    case OT_SHOT:
      if (!bounce)
	objs[i].active=A_INACTIVE;
      break;
    case OT_SMALL_ROCK:
    case OT_MEDIUM_ROCK:
      i2=ObjAlloc(objs[i].type-1);
      objs[i2].active=A_TRANSITION;
      o_state[i2].x=o_state[i].x+objs[i2].radius+2.0;
      o_state[i2].y=o_state[i].y;
      o_state[i2].È=o_state[i].È;
      o_state[i2].DxDt=o_state[i].DxDt;
      o_state[i2].DyDt=o_state[i].DyDt;
      o_state[i2].DÈDt=o_state[i].DÈDt;

      i2=ObjAlloc(objs[i].type-1);
      objs[i2].active=A_TRANSITION;
      o_state[i2].x=o_state[i].x-objs[i2].radius-2.0;
      o_state[i2].y=o_state[i].y;
      o_state[i2].È=o_state[i].È;
      o_state[i2].DxDt=o_state[i].DxDt;
      o_state[i2].DyDt=o_state[i].DyDt;
      o_state[i2].DÈDt=o_state[i].DÈDt;

      objs[i].active=A_INACTIVE;
      break;
    case OT_LARGE_ROCK:
      i2=ObjAlloc(objs[i].type-1);
      objs[i2].active=A_TRANSITION;
      o_state[i2].x=o_state[i].x+objs[i2].radius+4.0;
      o_state[i2].y=o_state[i].y+objs[i2].radius+4.0;
      o_state[i2].È=o_state[i].È;
      o_state[i2].DxDt=o_state[i].DxDt;
      o_state[i2].DyDt=o_state[i].DyDt;
      o_state[i2].DÈDt=o_state[i].DÈDt;

      i2=ObjAlloc(objs[i].type-1);
      objs[i2].active=A_TRANSITION;
      o_state[i2].x=o_state[i].x-objs[i2].radius-4.0;
      o_state[i2].y=o_state[i].y-objs[i2].radius-4.0;
      o_state[i2].È=o_state[i].È;
      o_state[i2].DxDt=o_state[i].DxDt;
      o_state[i2].DyDt=o_state[i].DyDt;
      o_state[i2].DÈDt=o_state[i].DÈDt;

      i2=ObjAlloc(objs[i].type-1);
      objs[i2].active=A_TRANSITION;
      o_state[i2].x=o_state[i].x-objs[i2].radius-4.0;
      o_state[i2].y=o_state[i].y+objs[i2].radius+4.0;
      o_state[i2].È=o_state[i].È;
      o_state[i2].DxDt=o_state[i].DxDt;
      o_state[i2].DyDt=o_state[i].DyDt;
      o_state[i2].DÈDt=o_state[i].DÈDt;

      i2=ObjAlloc(objs[i].type-1);
      objs[i2].active=A_TRANSITION;
      o_state[i2].x=o_state[i].x+objs[i2].radius+4.0;
      o_state[i2].y=o_state[i].y-objs[i2].radius-4.0;
      o_state[i2].È=o_state[i].È;
      o_state[i2].DxDt=o_state[i].DxDt;
      o_state[i2].DyDt=o_state[i].DyDt;
      o_state[i2].DÈDt=o_state[i].DÈDt;

      objs[i].active=A_INACTIVE;
      break;
  }

  switch (objs[j].type) {
    case OT_SHIELD_SHIP:
    case OT_NO_SHIELD_SHIP:
      if (!bounce) {
	cmd_code=CMD_GAME_OVER;
	objs[j].active=A_INACTIVE;
      }
      break;
    case OT_CARGO:
      cmd_code=CMD_GAME_OVER;
      objs[j].active=A_INACTIVE;
      break;
    case OT_TINY_ROCK:
      if (objs[i].type==OT_SHOT && !bounce)
	objs[j].active=A_INACTIVE;
      break;
    case OT_SHOT:
      if (!bounce)
	objs[j].active=A_INACTIVE;
      break;
    case OT_SMALL_ROCK:
    case OT_MEDIUM_ROCK:
      i2=ObjAlloc(objs[j].type-1);
      objs[i2].active=A_TRANSITION;
      o_state[i2].x=o_state[j].x+objs[i2].radius+2.0;
      o_state[i2].y=o_state[j].y;
      o_state[i2].È=o_state[j].È;
      o_state[i2].DxDt=o_state[j].DxDt;
      o_state[i2].DyDt=o_state[j].DyDt;
      o_state[i2].DÈDt=o_state[j].DÈDt;

      i2=ObjAlloc(objs[j].type-1);
      objs[i2].active=A_TRANSITION;
      o_state[i2].x=o_state[j].x-objs[i2].radius-2.0;
      o_state[i2].y=o_state[j].y;
      o_state[i2].È=o_state[j].È;
      o_state[i2].DxDt=o_state[j].DxDt;
      o_state[i2].DyDt=o_state[j].DyDt;
      o_state[i2].DÈDt=o_state[j].DÈDt;

      objs[j].active=A_INACTIVE;
      break;

    case OT_LARGE_ROCK:
      i2=ObjAlloc(objs[j].type-1);
      objs[i2].active=A_TRANSITION;
      o_state[i2].x=o_state[j].x+objs[i2].radius+4.0;
      o_state[i2].y=o_state[j].y+objs[i2].radius+4.0;
      o_state[i2].È=o_state[j].È;
      o_state[i2].DxDt=o_state[j].DxDt;
      o_state[i2].DyDt=o_state[j].DyDt;
      o_state[i2].DÈDt=o_state[j].DÈDt;

      i2=ObjAlloc(objs[j].type-1);
      objs[i2].active=A_TRANSITION;
      o_state[i2].x=o_state[j].x-objs[i2].radius-4.0;
      o_state[i2].y=o_state[j].y-objs[i2].radius-4.0;
      o_state[i2].È=o_state[j].È;
      o_state[i2].DxDt=o_state[j].DxDt;
      o_state[i2].DyDt=o_state[j].DyDt;
      o_state[i2].DÈDt=o_state[j].DÈDt;

      i2=ObjAlloc(objs[j].type-1);
      objs[i2].active=A_TRANSITION;
      o_state[i2].x=o_state[j].x-objs[i2].radius-4.0;
      o_state[i2].y=o_state[j].y+objs[i2].radius+4.0;
      o_state[i2].È=o_state[j].È;
      o_state[i2].DxDt=o_state[j].DxDt;
      o_state[i2].DyDt=o_state[j].DyDt;
      o_state[i2].DÈDt=o_state[j].DÈDt;

      i2=ObjAlloc(objs[j].type-1);
      objs[i2].active=A_TRANSITION;
      o_state[i2].x=o_state[j].x+objs[i2].radius+4.0;
      o_state[i2].y=o_state[j].y-objs[i2].radius-4.0;
      o_state[i2].È=o_state[j].È;
      o_state[i2].DxDt=o_state[j].DxDt;
      o_state[i2].DyDt=o_state[j].DyDt;
      o_state[i2].DÈDt=o_state[j].DÈDt;

      objs[j].active=A_INACTIVE;
      break;
  }
}

U0 CheckCollisions()
{
  I64 i,j;
  F64 d,d1,dd,dx,dy;
  CDC *dc;
  for (i=0;i<O_OBJS_NUM;i++) {
    if (objs[i].active==A_ACTIVE) {
      for (j=i+1;j<O_OBJS_NUM;j++) {
	if (objs[j].active==A_ACTIVE) {
	  dx=o_state[i].x-o_state[j].x;
	  dy=o_state[i].y-o_state[j].y;
	  dd=Sqr(dx)+Sqr(dy);
	  d=Sqrt(dd);

	  if (d) {
	    dx/=d;
	    dy/=d;
	  } else {
	    dx=0;
	    dy=0;
	  }

	  d1=objs[i].radius+objs[j].radius;
	  if (dd<Sqr(d1)) {
	    dc=DCNew(64,64);
	    Sprite3ZB(dc,32,32,0,objs[i].img,o_state[i].È);
	    dc->color=ROP_COLLISION;
	    dc->bkcolor=BLACK;
	    Sprite3ZB(dc,o_state[j].x-o_state[i].x+32,
		  o_state[j].y-o_state[i].y+32,0,
		  objs[j].img,o_state[j].È);
	    if (dc->collision_cnt>0)
	      Collision(i,j);
	    DCDel(dc);
	  }
	}
      }
    }
  }
  for (i=0;i<O_OBJS_NUM;i++)
    if (objs[i].active==A_TRANSITION)
      objs[i].active=A_ACTIVE;
}

#define MUZZLE_VELOCITY 500.0

U0 Fire()
{
  F64 È=o_state[O_SHIP].È;
  I64 i=ObjAlloc(OT_SHOT);
  objs[i].timeout=tS+0.5;
  objs[i].mass*=10.0;
  o_state[i].x=o_state[O_SHIP].x+
	(objs[O_SHIP].radius+objs[i].radius+1.0)*Cos(È-„/2.0);
  o_state[i].y=o_state[O_SHIP].y+
	(objs[O_SHIP].radius+objs[i].radius+1.0)*Sin(È-„/2.0);
  o_state[i].DxDt=o_state[O_SHIP].DxDt+MUZZLE_VELOCITY*Cos(È-„/2.0);
  o_state[i].DyDt=o_state[O_SHIP].DyDt+MUZZLE_VELOCITY*Sin(È-„/2.0);
  o_state[i].DÈDt=RandI16/3000.0;

  //not real physics with the 0.005 factor
  o_state[O_SHIP].DxDt-=
	0.005*MUZZLE_VELOCITY*Cos(È-„/2.0)*objs[i].mass/objs[O_SHIP].mass;
  o_state[O_SHIP].DyDt-=
	0.005*MUZZLE_VELOCITY*Sin(È-„/2.0)*objs[i].mass/objs[O_SHIP].mass;
}

U0 CheckCrazy()
{
  I64 i;
  F64 d;
  for (i=0;i<O_OBJS_NUM;i++)
    if (objs[i].active==A_ACTIVE) {
      d=Sqrt(Sqr(o_state[i].DxDt)+Sqr(o_state[i].DyDt));
      if (d>MUZZLE_VELOCITY*5.0)
	In(" ");
    }
}

U0 SongTask(I64)
{ //Song by Terry A. Davis
  Fs->task_end_cb=&SndTaskEndCB;
  MusicSettingsRst;
  while (TRUE) {
    Play("5eGGsGGeGGGe.GeCDsEDeC4BAe.A5eG");
    Play("5GsGGeGGGe.GeFEsDEeDC4Be.A5eFD");
    Play("5EDFDEDECDCECDCsGGeG");
    Play("5GG4hG5sGGeGGG4hG");
  }
}

U0 Rocks()
{
  I64 ch,sc,msg_code;
  CMenuEntry *tmpse;

  PopUpOk(
	"I refuse to rip-off the original\n"
	"so this is intentionally unplayable\n"
	"and included for demonstration\n"
	"purposes.\n\n"
	"Write games, don't play them.\n");

  SettingsPush; //See $LK,"SettingsPush",A="MN:SettingsPush"$
  Fs->song_task=Spawn(&SongTask,NULL,"Song",,Fs);

  MenuPush(
	"File {"
	"  Abort(,CH_SHIFT_ESC);"
	"  Exit(,CH_ESC);"
	"}"
	"Play {"
	"  Restart(,'\n');"
	"  Fire(,CH_SPACE);"
	"  Fwd(,,SC_CURSOR_UP);"
	"  Left(,,SC_CURSOR_LEFT);"
	"  Right(,,SC_CURSOR_RIGHT);"
	"  ToggleBounce(,'b');"
	"}"
	);
  tmpse=MenuEntryFind(Fs->cur_menu,"Play/ToggleBounce");
  tmpse->checked=bounce=TRUE;

  ode=ODENew(O_OBJS_NUM*6,0.01);
  ode->derive=&MyDerivative;
  ode->min_tolerance=0.001*ode->max_tolerance;
  o_state=ode->state;
  objs=MAlloc(O_OBJS_NUM*sizeof(Obj));

  AutoComplete;
  WinBorder;
  WinMax;
  DocCursor;
  DocClear;

  Init;
  QueIns(ode,Fs->last_ode);
  Fs->draw_it=&DrawIt;

  try {
    while (TRUE) {
      while (msg_code=ScanMsg(&ch,&sc,1<<MSG_KEY_DOWN|1<<MSG_KEY_UP)) {
	if (msg_code==MSG_KEY_DOWN)
	  switch (ch) {
	    case 0:
	      switch (sc.u8[0]) {
		case SC_CURSOR_RIGHT:
		  cmd_code=CMD_SPIN_RIGHT;
		  break;
		case SC_CURSOR_LEFT:
		  cmd_code=CMD_SPIN_LEFT;
		  break;
		case SC_CURSOR_UP:
		  cmd_code=CMD_THRUST;
		  break;
	      }
	      break;
	    case CH_SPACE:
	      Fire;
	      break;
	    case '\n':
	      Init;
	      break;
	    case CH_ESC:
	    case CH_SHIFT_ESC:
	      goto rk_done;
	    case 'b':
	      tmpse=MenuEntryFind(Fs->cur_menu,"Play/ToggleBounce");
	      tmpse->checked=bounce=!bounce;
	      if (bounce)
		objs[O_SHIP].type=OT_SHIELD_SHIP;
	      else
		objs[O_SHIP].type=OT_NO_SHIELD_SHIP;
	      break;
	  }
	else //MSG_KEY_UP
	  cmd_code=CMD_NULL;
      }
      CheckCollisions;
      CheckCrazy;
      if (cmd_code==CMD_GAME_OVER) {
	Sleep(1000);
	Init;
      }
      Refresh; //msgs are only qued by winmgr
    }
rk_done:
    GetMsg(,,1<<MSG_KEY_UP);
  } catch
    PutExcept;

  QueRem(ode);
  ODEDel(ode);
  Free(objs);
  MenuPop;

  SettingsPop;
}

Rocks;

U0 DoRocks()
{
  I64 i;
  CTask *task=User;
  XTalk(task,"#include \"::/TempleOS/Demo/Games/Rocks\";\n");
  BirthWait(&task->popup_task);
  TaskWait(task->popup_task);
  PostMsgWait(task->popup_task,MSG_KEY_DOWN_UP,CH_SPACE,0);
  DeathWait(&task->popup_task);
  PostMsgWait(task,MSG_KEY_DOWN,0,SC_CURSOR_RIGHT);
  Sleep(300);
  for (i=0;i<15;i++) {
    PostMsgWait(task,MSG_KEY_DOWN_UP,CH_SPACE,0);
    Sleep(100);
  }
  PostMsgWait(task,MSG_KEY_UP,0,SC_CURSOR_RIGHT);
  PostMsgWait(task,MSG_KEY_DOWN_UP,CH_SHIFT_ESC,0);
  DeathWait(&task,TRUE);
}


$SP+PU,"Rocks",LM="#include \"::/TempleOS/Demo/Games/Rocks\";",BI=15$        Æ        
   ˘ˇˇˇ¸ˇˇˇ   
¸ˇˇˇ         
         ˙ˇˇˇ
ˇˇˇˇ   ˛ˇˇˇ   
˛ˇˇˇ         
               
ˇˇˇˇ   ˝ˇˇˇ   
˝ˇˇˇ         
            
            
         ˜ˇˇˇ
   ˜ˇˇˇ˚ˇˇˇ   
˚ˇˇˇ   ˇˇˇˇ   
         ¯ˇˇˇ
          ¯ˇˇˇ   
   	      	   
   	   
      

      	      
	         Ùˇˇˇ
   Ùˇˇˇ    Ùˇˇˇ
    Ùˇˇˇ˘ˇˇˇ   
˘ˇˇˇ   ˘ˇˇˇ   
˘ˇˇˇ   ˛ˇˇˇ	   
˛ˇˇˇ	      	                   
   ˘ˇˇˇ¸ˇˇˇ   
¸ˇˇˇ         
         ˙ˇˇˇ
ˇˇˇˇ   ˛ˇˇˇ   
˛ˇˇˇ         
               
ˇˇˇˇ   ˝ˇˇˇ   
˝ˇˇˇ         
            
            
         ˜ˇˇˇ
   ˜ˇˇˇ˚ˇˇˇ   
˚ˇˇˇ   ˇˇˇˇ   
         ¯ˇˇˇ
          ¯ˇˇˇ   
ˇˇˇˇ   ˛ˇˇˇ
   
˛ˇˇˇ
         
         
   
   
         
             
             
            
    	             
˝ˇˇˇ
      
   
   
   
      

         Ûˇˇˇ
   Ûˇˇˇ¯ˇˇˇ   
¯ˇˇˇ   ˚ˇˇˇ	   
˚ˇˇˇ	       	    	       3         	   ˛ˇˇˇ˝ˇˇˇÛlﬂ$Ü	n[Ω	   ˛ˇˇˇ   d®         ä         	g   ˛ˇˇˇ˚ˇˇˇn[œ∂mí$Cí$…$Q∂e€ºÑarñÕ≥ÌŸûWí"Cö∂Ωm€≤	      ˙ˇˇˇ∂mí6M€+	   ¸ˇˇˇ   §m    	
   ˛ˇˇˇ˛ˇˇˇ§i€	   
      I≤        G        	r   ¸ˇˇˇÙˇˇˇÛÊy^›⁄≥mì$Ì€∂m€≥gí°FCQå¢d["â©(	≥l¡∞lû◊n	         $IíT§$√	   ˜ˇˇˇ   û=€$	Õ       ˙ˇˇˇ´]ª∂mì¶IFIí$IíÑIrYñms◊zı÷m∂k€&M€∂mì§%ëíl∂e[í$âH“∑mõ<Iì$Ií$Ií≥m€∂m€∂m[Däå	   ¸ˇˇˇ¯ˇˇˇ∂Mﬂßm{	      ˛ˇˇˇIê…∂mõ∑y€	   ˘ˇˇˇ   v]◊£í,KÄ$…	W       	   $•êQëIäK∞Ÿ2€¥MoKíd…∂mõ=œ3Oì¶=	   ¯ˇˇˇ˙ˇˇˇ´Îu¶ 
       6         	(   ˇˇˇˇ˚ˇˇˇ€l€§mìd¬ê$∑m≤d	   ˛ˇˇˇ˛ˇˇˇˆi⁄        k         	M      ¯ˇˇˇÿ∂∂µk€¶œì$€$â$í Aí$$mªﬁ6œÛf	G   ˇˇˇˇ˚ˇˇˇuÎ⁄ˆHÜEQdl€ˆ∂-Q$∆Î ¡≤l∂m	   ˝ˇˇˇ˙ˇˇˇ                	Ÿ      ˆˇˇˇs€÷mÎ÷≠œü∂m˚$•$î"mYê%â¢(#Ií⁄ˆm€Ækª@í,À∂mˆº$aÖâ¬ê$m€æiíæ˘€¡∂m€∂mõÁ∫vm[I§Ñâ¬D	G      ¯ˇˇˇÆÎ⁄ˆÏ%õm€∂Iö¥Ìz€öà‹˛oI&I	G         Aí$Ií$IIîmì§Ôm€∂’û∑$
í!…	+   ¯ˇˇˇ˛ˇˇˇ∂kª∂Èˇ¥m”$ô0Lêe[ 	      ˝ˇˇˇIñ … 	   ˙ˇˇˇ   ∂]€	"   	   ˝ˇˇˇõ∑Õ∂m&	•ê¶Ì≠                
   ˘ˇˇˇ¸ˇˇˇ   
¸ˇˇˇ         
         ˙ˇˇˇ
ˇˇˇˇ   ˛ˇˇˇ   
˛ˇˇˇ         
               
ˇˇˇˇ   ˝ˇˇˇ   
˝ˇˇˇ         
            
            
         ˜ˇˇˇ
   ˜ˇˇˇ˚ˇˇˇ   
˚ˇˇˇ   ˇˇˇˇ   
         ¯ˇˇˇ
          ¯ˇˇˇ        ü        
   ˘ˇˇˇ¸ˇˇˇ   
¸ˇˇˇ         
         ˙ˇˇˇ
ˇˇˇˇ   ˛ˇˇˇ   
˛ˇˇˇ         
               
ˇˇˇˇ   ˝ˇˇˇ   
˝ˇˇˇ         
            
            
         ˜ˇˇˇ
   ˜ˇˇˇ˚ˇˇˇ   
˚ˇˇˇ   ˇˇˇˇ   
         ¯ˇˇˇ
          ¯ˇˇˇ   
ˇˇˇˇ   ˛ˇˇˇ
   
˛ˇˇˇ
         
         
   
   
         
             
             
            
    	                  '      	   ˛ˇˇˇ˛ˇˇˇ4In]Kj	   ˇˇˇˇ   	        (      	   ˛ˇˇˇ   6ô%If	   ˝ˇˇˇ    $I        Û      ˇˇˇˇ˛ˇˇˇ                   ˛ˇˇˇ˛ˇˇˇ˝ˇˇˇ˛ˇˇˇ    ˇˇˇˇˇˇˇˇˇˇˇˇ      ˇˇˇˇ˛ˇˇˇˇˇˇˇ    ˛ˇˇˇ˛ˇˇˇ˛ˇˇˇˇˇˇˇˇˇˇˇ      ˛ˇˇˇ   ˛ˇˇˇˇˇˇˇ    ˝ˇˇˇ      ˇˇˇˇˇˇˇˇ    ˝ˇˇˇ˛ˇˇˇˇˇˇˇ   ˇˇˇˇˇˇˇˇ˝ˇˇˇ
        ˛ˇˇˇ˝ˇˇˇ˛ˇˇˇ            æ        
    ˇˇˇ      
˛ˇˇˇ   ˇˇˇˇ   
            
˚ˇˇˇ˙ˇˇˇ   ˚ˇˇˇ   
˙ˇˇˇ˘ˇˇˇ    ˆˇˇˇ
    ˆˇˇˇ   ˙ˇˇˇ
            
˛ˇˇˇ   ¸ˇˇˇ   
¸ˇˇˇ   ˝ˇˇˇ   
˝ˇˇˇ         
            
            
˝ˇˇˇ
      
   
˛ˇˇˇ˚ˇˇˇ˛ˇˇˇ   
   ˚ˇˇˇ      
             
         	   
            
    	   ˇˇˇˇ   
˙ˇˇˇ¸ˇˇˇ	   ˚ˇˇˇ
             
            
            
            
˛ˇˇˇ                  ü        
ÔˇˇˇÁˇˇˇÍˇˇˇÒˇˇˇ
ÍˇˇˇÒˇˇˇÙˇˇˇÒˇˇˇ
ÙˇˇˇÒˇˇˇÔˇˇˇËˇˇˇ
ÌˇˇˇÚˇˇˇÏˇˇˇıˇˇˇ
ÏˇˇˇıˇˇˇÚˇˇˇÙˇˇˇ
ÚˇˇˇÙˇˇˇÔˇˇˇÚˇˇˇ   
ÌˇˇˇÒˇˇˇÎˇˇˇıˇˇˇ
ÎˇˇˇıˇˇˇÛˇˇˇıˇˇˇ
ÛˇˇˇıˇˇˇˇˇˇÒˇˇˇ
ˇˇˇÒˇˇˇıˇˇˇˇˇˇ
ıˇˇˇˇˇˇÔˇˇˇÂˇˇˇ
ÔˇˇˇÂˇˇˇÈˇˇˇˇˇˇ
ÈˇˇˇˇˇˇÌˇˇˇÒˇˇˇ
ÔˇˇˇÔˇˇˇÔˇˇˇÊˇˇˇ
ÓˇˇˇÔˇˇˇÔˇˇˇÊˇˇˇ   
ÌˇˇˇıˇˇˇÏˇˇˇ¯ˇˇˇ
Ïˇˇˇ¯ˇˇˇÔˇˇˇ˛ˇˇˇ
Ôˇˇˇ˛ˇˇˇÛˇˇˇ¯ˇˇˇ
Ûˇˇˇ¯ˇˇˇÒˇˇˇÙˇˇˇ
Ôˇˇˇ˝ˇˇˇÓˇˇˇˆˇˇˇ
ˇˇˇ˘ˇˇˇÓˇˇˇˆˇˇˇ
Ôˇˇˇ˚ˇˇˇÔˇˇˇˆˇˇˇ
Óˇˇˇ˜ˇˇˇÓˇˇˇ˙ˇˇˇ 