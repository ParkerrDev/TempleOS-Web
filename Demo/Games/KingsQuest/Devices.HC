//PCjr memory map, disk services, keyboard buffer and 320x200 video.
#define KQ_DISK_SIZE 368640
#define KQ_VIDEO 0x18000
U8 *kq_disk,*kq_font;
I64 kq_keys[32],kq_head,kq_tail,kq_dirty,kq_ticks,kq_cx,kq_cy;
I64 kq_tone[4],kq_atten[4],kq_latch,kq_port61,kq_retrace;

U0 KqPixel(I64 x,I64 y,I64 c)
{
  I64 at,shift;
  if (x<0 || x>=320 || y<0 || y>=200) return;
  at=KQ_VIDEO+(y&3)*8192+(y>>2)*160+(x>>1);
  shift=(1-(x&1))*4;
  if (c&128) kq_ram[at]^=(c&15)<<shift;
  else kq_ram[at]=(kq_ram[at]&~(15<<shift))|((c&15)<<shift);
}

I64 KqPixelGet(I64 x,I64 y)
{
  if (x<0 || x>=320 || y<0 || y>=200) return 0;
  return (kq_ram[KQ_VIDEO+(y&3)*8192+(y>>2)*160+(x>>1)]>>
	((1-(x&1))*4))&15;
}

U0 KqLetter(I64 ch,I64 col,I64 x,I64 y)
{
  I64 i,j,row;
  for (i=0;i<8;i++) {
    row=kq_font[(ch&255)*8+i];
    for (j=0;j<8;j++)
      if (row&(1<<j)) KqPixel(x*8+j,y*8+i,col);
      else if (!(col&128)) KqPixel(x*8+j,y*8+i,0);
  }
}

U0 KqScroll(I64 left,I64 top,I64 right,I64 bottom,I64 lines,I64 color)
{
  I64 x,y,c;
  if (right>39) right=39;
  if (bottom>24) bottom=24;
  for (y=top*8;y<(bottom+1)*8;y++)
    for (x=left*8;x<(right+1)*8;x++) {
      c=color;
      if (lines && y+(lines*8)<(bottom+1)*8) c=KqPixelGet(x,y+lines*8);
      KqPixel(x,y,c);
    }
}

U0 KqVideo(I64 fn,I64 al)
{
  I64 i,pos,b=kq_r[3];
  switch (fn) {
    case 0:
      kq_ram[0x449]=al&127;KqWordPut(0x44A,40);
      if (!(al&128)) MemSet(kq_ram+KQ_VIDEO,0,32768);
      kq_cx=0;kq_cy=0;break;
    case 1:case 5:case 11:break;
    case 2:kq_cx=kq_r[2]&255;kq_cy=kq_r[2]>>8;break;
    case 3:kq_r[2]=kq_cx+(kq_cy<<8);kq_r[1]=0x0607;break;
    case 6:KqScroll(kq_r[1]&255,kq_r[1]>>8,kq_r[2]&255,kq_r[2]>>8,al,b>>8);break;
    case 9:case 10:
      pos=kq_cy*40+kq_cx;
      for (i=0;i<kq_r[1] && pos+i<1000;i++)
	KqLetter(al,b&255,(pos+i)%40,(pos+i)/40);
      break;
    case 12:KqPixel(kq_r[1],kq_r[2],al);break;
    case 13:KqSetReg(0,0,KqPixelGet(kq_r[1],kq_r[2]));break;
    case 14:
      if (al==13) kq_cx=0;
      else if (al==10) kq_cy++;
      else if (al==8) {if (kq_cx) kq_cx--;}
      else if (al>=32) {
	KqLetter(al,b&15,kq_cx,kq_cy);
	if (++kq_cx>=40) {kq_cx=0;kq_cy++;}
      }
      if (kq_cy>24) {KqScroll(0,0,39,24,1,0);kq_cy=24;}
      break;
    case 15:kq_r[0]=0x2800|kq_ram[0x449];KqSetReg(7,0,0);break;
  }
  KqWordPut(0x450,kq_cx+(kq_cy<<8));
}

U0 KqKey(I64 scan,I64 ascii)
{
  I64 next=(kq_tail+1)&31;
  if (next==kq_head) return;
  if (ascii==10) ascii=13;
  if (ascii<0 || ascii>127) ascii=0;
  kq_keys[kq_tail]=((scan&127)<<8)|ascii;kq_tail=next;kq_wait=0;
}

U0 KqBios(I64 n)
{
  I64 fn=kq_r[0]>>8,al=kq_r[0]&255,lba,a,len;
  switch (n) {
    case 0x10:KqVideo(fn,al);break;
    case 0x11:kq_r[0]=KqWord(0x410);break;
    case 0x12:kq_r[0]=128;break;
    case 0x13:
      KqFlag(1,0);KqSetReg(4,0,0);
      if (!fn || fn==1) break;
      if (fn==8) {kq_r[1]=0x2709;kq_r[2]=0x0101;break;}
      lba=(((kq_r[1]>>8)*2+(kq_r[2]>>8))*9+(kq_r[1]&63)-1)*512;
      len=al*512;a=KqAddr(kq_s[0],kq_r[3]);
      if (lba<0 || lba+len>KQ_DISK_SIZE || a+len>0x100000 ||
	    (fn!=2 && fn!=3 && fn!=4)) {
	KqFlag(1,1);KqSetReg(4,0,4);break;
      }
      if (fn==2) MemCpy(kq_ram+a,kq_disk+lba,len);
      if (fn==3) {MemCpy(kq_disk+lba,kq_ram+a,len);kq_dirty=1;}
      break;
    case 0x16:
      if (fn==0 || fn==1) {
	KqFlag(KQ_ZF,kq_tail==kq_head);
	if (kq_tail!=kq_head) {
	  kq_r[0]=kq_keys[kq_head];
	  if (!fn) kq_head=(kq_head+1)&31;
	} else if (!fn) {kq_ip=kq_at;kq_wait=1;}
      } else if (fn==2) KqSetReg(0,0,0);
      break;
    case 0x1A:kq_r[1]=kq_ticks>>16;kq_r[2]=kq_ticks;KqSetReg(0,0,0);break;
    case 0x01:case 0x03:case 0x1C:break;
    default:kq_fault=0x200+n;
  }
}

I64 KqIn(I64 port)
{
  if (port==0x3DA) {kq_retrace^=9;return kq_retrace;}
  if (port==0x61) return kq_port61;
  //Unplugged game port: axis capacitors stay high through Sierra's timeout.
  if (port==0x201) return 0xFF;
  return 0;
}

U0 KqOut(I64 port,I64 val)
{
  I64 voice;
  if (port==0x61) kq_port61=val;
  if (port!=0xC0) return;
  if (val&128) kq_latch=(val>>4)&7;
  voice=kq_latch>>1;
  if (kq_latch&1) kq_atten[voice]=val&15;
  else if (val&128) kq_tone[voice]=(kq_tone[voice]&1008)|(val&15);
  else kq_tone[voice]=(kq_tone[voice]&15)|((val&63)<<4);
}

U0 KqBoot()
{
  I64 i;
  MemSet(kq_ram,0,0x100000);
  MemSet(kq_r,0,16);MemSet(kq_s,0,8);
  for (i=0;i<256;i++) {
    KqWordPut(i*4,i*4);KqWordPut(i*4+2,0xF000);
    kq_ram[0xF0000+i*4]=0xCF;
  }
  kq_ram[0xFFFFE]=0xFD;KqWordPut(0x410,0x21);KqWordPut(0x413,128);
  KqWordPut(0x41A,0x1E);KqWordPut(0x41C,0x1E);
  MemCpy(kq_ram+0x7C00,kq_disk,512);
  kq_r[4]=0x5F0;kq_ip=0x7C00;kq_flags=0x202;
  kq_head=0;kq_tail=0;kq_fault=0;kq_ticks=0;kq_wait=0;kq_dirty=0;
  kq_port61=0;kq_latch=0;kq_retrace=0;
  for (i=0;i<4;i++) {kq_atten[i]=15;kq_tone[i]=0;}
}

U0 KqTick()
{
  kq_ticks++;KqWordPut(0x46C,kq_ticks);KqWordPut(0x46E,kq_ticks>>16);
  if ((kq_flags&KQ_IF) && KqWord(0x72)!=0xF000) KqInt(0x1C);
}
