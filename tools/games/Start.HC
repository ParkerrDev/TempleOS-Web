//Starts a game the way the site's Games window does and says how it went.
//The launch is the site's own, from engine/guestexec.js: $LK,"PopUp",A="MN:PopUp"$
//with no parent, so the game's task hangs off Seth and nothing waits on it.
//Keys go in where $LK,"KbdPktRead",A="MN:KbdPktRead"$ puts the bytes it reads.

#define START_WAIT	15.0 //Seconds a game must run to count as started
#define START_QUIT	5.0 //Seconds it has after each key to quit

#define RUN_STARTED	1 //What the launch writes in StartBox.state
#define RUN_RETURNED	2
#define RUN_EXCEPT	3

class StartBox
{//Laid out as the site's mailbox: state, exception, task.
  I64 state,except_ch;
  CTask *task;
} start_box;

U8 start_esc[2]={0x01,0x81},
	start_shift_esc[4]={0x2A,0x01,0x81,0xAA};

U0 StartKeys(U8 *bytes,I64 cnt)
{//Set-1 bytes, as the keyboard interrupt hands them on.
  I64 i;
  PUSHFD
  CLI
  for (i=0;i<cnt;i++)
    FifoU8Ins(kbd.fifo2,bytes[i]);
  POPFD
}

Bool StartWait(F64 secs)
{//TRUE when the game is over within secs.
  F64 t0=tS;
  while (tS-t0<secs) {
    if (start_box.state>=RUN_RETURNED || !TaskValidate(start_box.task))
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

public U0 StartChk(U8 *code)
{//code is the ExeFile2 or ExePutS2 statement the site runs.
  U8 *st;
  MemSet(&start_box,0,sizeof(StartBox));
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
    " - -\n";
  } else {
    "running ";
    StartKeys(start_esc,sizeof(start_esc));
    if (StartWait(START_QUIT)) {
      "esc ";
      StartEndPrint;
    } else {
      StartKeys(start_shift_esc,sizeof(start_shift_esc));
      if (StartWait(START_QUIT)) {
	"shift-esc ";
	StartEndPrint;
      } else {
	"ignored -";
	Kill(start_box.task);
      }
    }
    '\n';
  }
}
