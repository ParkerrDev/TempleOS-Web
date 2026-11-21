//Starts a game the way the site's Games window does, plays its events and
//says how it went. The launch is the site's own, from Kernel/GuestExec.js:
//$LK,"PopUp",A="MN:PopUp"$ with no parent, so the game's task hangs off Seth
//and nothing waits on it. Keys go in where $LK,"KbdPktRead",A="MN:KbdPktRead"$
//puts the bytes it reads. Start.mjs defines START_WAIT, START_QUIT,
//PLAY_EV_NUM and play_ev, made by Play.mjs's PlayEvents.

#define RUN_STARTED	1 //What the launch writes in StartBox.state
#define RUN_RETURNED	2
#define RUN_EXCEPT	3

#define PLAY_SNAP	1 //play_ev ops: snap the screen,
#define PLAY_KEY	2 //put in set-1 bytes, packed low byte first,
#define PLAY_MS		3 //set the mouse, x+y<<16 and l+r<<1,
#define PLAY_QUIT	4 //or give the game START_QUIT seconds to end.

class StartBox
{//Laid out as the site's mailbox: state, exception, task.
  I64 state,except_ch;
  CTask *task;
} start_box;

class PlayFrame
{
  I64 n,updates;
  U8 *body;
} play_frames[PLAY_EV_NUM];
I64 play_frames_cnt;
Bool start_ctrl,start_alt;

U0 StartKeys(I64 bytes,I64 cnt)
{//Set-1 bytes, as $LK,"KbdPktRead",A="MN:KbdPktRead"$ hands them on. The
//<CTRL-ALT-letter> calls it makes in the interrupt are made here, so
//<CTRL-ALT-c> breaks.
  I64 b,ch;
  PUSHFD
  CLI
  while (cnt--) {
    b=bytes&0xFF;
    bytes>>=8;
    if (b&0x7F==SC_CTRL)
      start_ctrl=!(b&0x80);
    else if (b&0x7F==SC_ALT)
      start_alt=!(b&0x80);
    else if (!(b&0x80) && start_ctrl && start_alt) {
      ch=ScanCode2Char(b)-'a';
      if (0<=ch<26 && keydev.fp_ctrl_alt_cbs[ch] &&
	    Bt(&keydev.ctrl_alt_in_irq_flags,ch))
	(*keydev.fp_ctrl_alt_cbs[ch])(b);
    }
    FifoU8Ins(kbd.fifo2,b);
  }
  POPFD
}

Bool StartOver()
{//TRUE when the game has ended.
  return start_box.state>=RUN_RETURNED || !TaskValidate(start_box.task);
}

Bool StartWait(F64 secs)
{//TRUE when the game is over within secs.
  F64 t0=tS;
  while (tS-t0<secs) {
    if (StartOver)
      return TRUE;
    Sleep(50);
  }
  return FALSE;
}

U0 StartEndPrint()
{//How the game's task ended.
  if (start_box.state==RUN_RETURNED)
    "returned";
  else if (start_box.state==RUN_EXCEPT)
    "except:%X",start_box.except_ch;
  else if (start_box.state==RUN_STARTED)
    "closed";
  else
    "never";
}

U0 PlaySnap(I64 n)
{//Save a completed frame. Serial output during play can swallow a mouse tap.
  PlayFrame *snap=&play_frames[play_frames_cnt++];
  I64 updates=winmgr.updates;
  Bool done=FALSE;
  snap->n=n;
  snap->body=MAlloc(GR_WIDTH*GR_HEIGHT);
  while (!done) {
    while (winmgr.updates==updates)
      Sleep(1);
    updates=winmgr.updates;
    PUSHFD
    CLI
    if (!Bt(&sys_semas[SEMA_REFRESH_IN_PROGRESS],0)) {
      MemCpy(snap->body,gr.dc2->body,GR_WIDTH*GR_HEIGHT);
      snap->updates=updates;
      done=TRUE;
    }
    POPFD
  }
}

U0 PlayFramesOut()
{//Encode and print the saved frames once all input has been delivered.
  I64 k,i,j,c;
  U8 *rle=MAlloc(GR_WIDTH*GR_HEIGHT*2+1),*dst,*body;
  PlayFrame *snap=play_frames;
  for (k=0;k<play_frames_cnt;k++,snap++) {
    dst=rle;
    body=snap->body;
    for (i=0;i<GR_WIDTH*GR_HEIGHT;i=j) {
      c=body[i]&15;
      for (j=i+1;j<GR_WIDTH*GR_HEIGHT && body[j]&15==c;j++);
      *dst++='A'+c;
      if (j-i>1)
        dst+=StrLen(StrPrint(dst,"%d",j-i));
    }
    *dst=0;
    "SNAP %d %d %s\n",snap->n,snap->updates,rle;
    Free(body);
  }
  Free(rle);
}

U0 PlayRun()
{//Plays play_ev, then says at which event the game was over and how.
  I64 i,*ev=play_ev;
  F64 t0=tS;
  for (i=0;i<PLAY_EV_NUM;i++,ev+=4) {
    while (tS-t0<ev[0]/1000.0 && !StartOver)
      Sleep(2);
    if (StartOver)
      goto pr_done;
    switch (ev[1]) {
      case PLAY_SNAP:
	PlaySnap(i);
	t0=tS-ev[0]/1000.0;
	break;
      case PLAY_KEY:
	StartKeys(ev[2],ev[3]);
	break;
      case PLAY_MS:
	MsSet(ev[2]&0xFFFF,ev[2]>>16,,ev[3]&1,ev[3]>>1);
	break;
      case PLAY_QUIT:
	if (StartWait(START_QUIT))
	  goto pr_done;
	t0=tS-ev[0]/1000.0; //What follows a quit counts from its end.
	break;
    }
  }
pr_done:
  "END %d ",i;
  if (i<PLAY_EV_NUM)
    StartEndPrint;
  else {
    '-';
    Kill(start_box.task);
  }
  '\n';
}

public U0 StartChk(U8 *code)
{//code is the ExeFile2 or ExePutS2 statement the site runs.
  U8 *st;
  MemSet(&start_box,0,sizeof(StartBox));
  start_ctrl=start_alt=FALSE;
  play_frames_cnt=0;
  MsSet(PLAY_MS_X,PLAY_MS_Y,,FALSE,FALSE);
  st=MStrPrint("*(0x%X)(I64 *)=1;*(0x%X)(I64 *)=Fs;WinMax;WinFocus;"
	"try{%s*(0x%X)(I64 *)=2;}catch{*(0x%X)(I64 *)=Fs->except_ch;"
	"Fs->catch_except=TRUE;*(0x%X)(I64 *)=3;}",
	&start_box.state,&start_box.task,code,&start_box.state,
	&start_box.except_ch,&start_box.state);
  PopUp(st,NULL,&start_box.task);
  Free(st);
  "START ";
  if (StartWait(START_WAIT)) {
    StartEndPrint;
    '\n';
  } else {
    "running\n";
    PlayRun;
    PlayFramesOut;
  }
}
