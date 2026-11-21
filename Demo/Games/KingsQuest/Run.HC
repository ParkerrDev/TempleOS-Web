#exe {Cd(__DIR__);}
#include "Cpu.HC"
#include "Devices.HC"
#define KQ_DISK_ID 0xD69D2404

CDC *kq_frame;
U32 kq_pair[256];
Bool kq_mute,kq_save_error;
I64 kq_last_tone;

U0 KqPaint()
{//PCjr mode 9. Four interleaved banks each hold fifty scanlines.
  I64 y,x;
  U8 *src;
  U32 *dst;
  for (y=0;y<200;y++) {
    src=kq_ram+KQ_VIDEO+(y&3)*8192+(y>>2)*160;
    dst=kq_frame->body+y*1280;
    for (x=0;x<160;x++)
      *dst++=kq_pair[*src++];
    MemCpy(dst,dst(U8 *)-640,640);
  }
}

U0 KqDraw(CTask *task,CDC *dc)
{
  I64 x=(task->pix_width-640)/2,y=MaxI64(12,(task->pix_height-400)/2);
  dc->color=BLACK;GrRect(dc,0,0,task->pix_width,task->pix_height);
  GrBlot(dc,x,y,kq_frame);
  dc->color=LTGRAY;
  GrPrint(dc,x+8,y-11,"KING'S QUEST   /   IBM PCjr");
  if (kq_save_error) GrPrint(dc,x+8,y+416,"Save disk write failed. Check free space in Home.");
  GrPrint(dc,x+8,y+404,"Arrows walk   Type a command + Enter   F10 sound   F12 quit");
}

U0 KqSpeaker()
{//Mix the loudest active tone channel down to the TempleOS PC speaker.
  I64 i,best=15,ona=0;
  if (!kq_mute)
    for (i=0;i<3;i++)
      if (kq_tone[i]>0 && kq_atten[i]<best) {
	best=kq_atten[i];ona=Freq2Ona(111860.8/kq_tone[i]);
      }
  if (ona!=kq_last_tone) {Snd(ona);kq_last_tone=ona;}
}

U32 KqDiskId(U8 *disk)
{
  I64 i;
  U32 h=2166136261;
  for (i=0;i<KQ_DISK_SIZE;i++) h=(h^disk[i])*16777619;
  return h&0xFFFFFFFF;
}

U0 KingsQuest()
{
  I64 i,ch,sc,msg,n=0,quota=0,steps;
  F64 clock,paint;
  U8 *saved=NULL;
  Bool quit=FALSE;
  kq_disk=FileRead("~/KQ1PCJR.IMG",&n);
  if (!kq_disk || n!=KQ_DISK_SIZE || KqDiskId(kq_disk)!=KQ_DISK_ID) {
    Free(kq_disk);kq_disk=NULL;
    "King's Quest requires the 360K PCjr edition.\n"
    "Copy KQ1PCJR.IMG to your Home directory and run again.\n";
    return;
  }
  SettingsPush;
  try {
    kq_ram=CAlloc(0x100000);kq_frame=DCNew(640,400);
    kq_font=text.font;
    if (FileFind("~/KQ1SAVE.IMG") && (saved=FileRead("~/KQ1SAVE.IMG",&n))) {
      if (n==KQ_DISK_SIZE) MemCpy(kq_disk,saved,n);
      Free(saved);saved=NULL;
    }
    for (i=0;i<256;i++)
      kq_pair[i]=(i>>4)*0x0101+(i&15)*0x01010000;
    AutoComplete;WinBorder;WinMax;DocCursor;DocClear;FlushMsgs;
    Fs->win_inhibit|=WIF_SELF_MS_L|WIF_SELF_MS_R|WIG_DBL_CLICK;
    KqBoot;kq_mute=FALSE;kq_save_error=FALSE;kq_last_tone=-1;
    Fs->draw_it=&KqDraw;
    clock=tS;paint=clock;
    while (!quit && !kq_fault) {
      while ((msg=ScanMsg(&ch,&sc,1<<MSG_KEY_DOWN))==MSG_KEY_DOWN) {
	if (sc.u8[0]==SC_F12 || ch==CH_SHIFT_ESC) quit=TRUE;
	else if (sc.u8[0]==SC_F10) kq_mute=!kq_mute;
	else KqKey(sc.u8[0],ch);
      }
      if (tS>=clock) {
	KqTick;
	quota=24000;clock=Max(clock+0.0549254,tS);
      }
      steps=MinI64(3000,quota);
      if (steps) {KqSlice(steps);quota-=steps;}
      if (tS>=paint) {KqPaint;KqSpeaker;paint=tS+1.0/30;}
      if (kq_dirty) {
	kq_save_error=!FileWrite("~/KQ1SAVE.IMG",kq_disk,KQ_DISK_SIZE);
	kq_dirty=0;
      }
      Yield;
    }
  } catch
    PutExcept;
  SettingsPop;
  Snd;DCDel(kq_frame);Free(kq_ram);Free(kq_disk);
  kq_frame=NULL;kq_ram=NULL;kq_disk=NULL;
  if (kq_fault) "PCjr stopped at %04X:%04X (%X).\n",kq_s[1],kq_at,kq_fault;
}

KingsQuest;
