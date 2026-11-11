#define TMf_KEY_RIGHT	    0
#define TMf_KEY_LEFT	    1
#define TMf_KEY_UP	    2
#define TMf_KEY_DOWN	    3
#define TMf_KEY_STRAFELEFT  4
#define TMf_KEY_STRAFERIGHT 5
#define TMf_KEY_FIRE	    6
#define TMf_KEY_USE	    7
#define TMf_KEY_STRAFE	    8
#define TMf_KEY_SPEED	    9
#define TMf_KEY_WEAPON	   10
#define TM_KEY_NUM	   18

class Controls
{
  I64 turn_tics,forward,side,turn,buttons,weapon,scan[TM_KEY_NUM+4];
};

U0 ControlsInit(Controls *tmpc)
{//Translate character keys once; the native bitmap uses merged scan codes.
  I64 i;
  MemSet(tmpc,0,sizeof(Controls)); tmpc->weapon=TM_WP_NOCHANGE;
  tmpc->scan[TMf_KEY_RIGHT]=SC_CURSOR_RIGHT;
  tmpc->scan[TMf_KEY_LEFT]=SC_CURSOR_LEFT;
  tmpc->scan[TMf_KEY_UP]=SC_CURSOR_UP;
  tmpc->scan[TMf_KEY_DOWN]=SC_CURSOR_DOWN;
  tmpc->scan[TMf_KEY_STRAFELEFT]=Char2ScanCode(',');
  tmpc->scan[TMf_KEY_STRAFERIGHT]=Char2ScanCode('.');
  tmpc->scan[TMf_KEY_FIRE]=SC_CTRL;
  tmpc->scan[TMf_KEY_USE]=Char2ScanCode(CH_SPACE);
  tmpc->scan[TMf_KEY_STRAFE]=SC_ALT;
  tmpc->scan[TMf_KEY_SPEED]=SC_SHIFT;
  for (i=0;i<8;i++) tmpc->scan[TMf_KEY_WEAPON+i]=Char2ScanCode('1'+i);
  tmpc->scan[TM_KEY_NUM]=Char2ScanCode('w');
  tmpc->scan[TM_KEY_NUM+1]=Char2ScanCode('s');
  tmpc->scan[TM_KEY_NUM+2]=Char2ScanCode('a');
  tmpc->scan[TM_KEY_NUM+3]=Char2ScanCode('d');
}

I64 ControlsKeys(Controls *tmpc,U8 *bitmap)
{//WASD aliases share the same command bits as the native arrow/strafe keys.
  I64 i,res=0;
  for (i=0;i<TM_KEY_NUM;i++)
    if (Bt(bitmap,tmpc->scan[i])) Bts(&res,i);
  for (i=0;i<4;i++)
    if (Bt(bitmap,tmpc->scan[TM_KEY_NUM+i])) Bts(&res,TMf_KEY_UP+i);
  return res;
}

U0 ControlsCmd(Controls *tmpc,I64 keys)
{//One keyboard command per simulation tic, with the original six-tic turn ramp.
  I64 forward=25,side=24,turn=640,i;
  tmpc->forward=tmpc->side=tmpc->turn=tmpc->buttons=0;
  tmpc->weapon=TM_WP_NOCHANGE;
  if (Bt(&keys,TMf_KEY_SPEED)) {forward=50; side=40; turn=1280;}
  if (Bt(&keys,TMf_KEY_RIGHT) || Bt(&keys,TMf_KEY_LEFT))
    tmpc->turn_tics++;
  else tmpc->turn_tics=0;
  if (tmpc->turn_tics<6) turn=320;
  if (Bt(&keys,TMf_KEY_STRAFE)) {
    if (Bt(&keys,TMf_KEY_RIGHT)) tmpc->side+=side;
    if (Bt(&keys,TMf_KEY_LEFT)) tmpc->side-=side;
  } else {
    if (Bt(&keys,TMf_KEY_RIGHT)) tmpc->turn-=turn;
    if (Bt(&keys,TMf_KEY_LEFT)) tmpc->turn+=turn;
  }
  if (Bt(&keys,TMf_KEY_UP)) tmpc->forward+=forward;
  if (Bt(&keys,TMf_KEY_DOWN)) tmpc->forward-=forward;
  if (Bt(&keys,TMf_KEY_STRAFERIGHT)) tmpc->side+=side;
  if (Bt(&keys,TMf_KEY_STRAFELEFT)) tmpc->side-=side;
  if (Bt(&keys,TMf_KEY_FIRE)) tmpc->buttons|=TM_BTF_ATTACK;
  if (Bt(&keys,TMf_KEY_USE)) tmpc->buttons|=TM_BTF_USE;
  for (i=0;i<8;i++)
    if (Bt(&keys,TMf_KEY_WEAPON+i)) {tmpc->weapon=i; break;}
  tmpc->forward=ClampI64(tmpc->forward,-50,50);
  tmpc->side=ClampI64(tmpc->side,-50,50);
}
