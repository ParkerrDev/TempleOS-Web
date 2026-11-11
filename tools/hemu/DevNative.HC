U64 dev_colors[16],dev_lba,dev_count,dev_sum,dev_writes,dev_tone;

U0 __host_palette(I64 i,I64 rgb)
{
  dev_colors[i]=rgb;
}

I64 __host_time(I64 idx)
{
  return 1000+idx;
}

U0 __snd(F64 hz)
{
  dev_tone=hz(U64);
}

U0 __host_disk(I64 lba,I64 cnt,U8 *buf)
{
  I64 i;
  dev_lba=lba;
  dev_count=cnt;
  for (i=0;i<cnt*512;i++)
    buf[i]=i*37+lba;
}

U0 __host_disk_wr(I64 lba,I64 cnt,U8 *buf)
{
  I64 i;
  dev_lba=lba;
  dev_count=cnt;
  dev_sum=0;
  for (i=0;i<cnt*512;i++)
    dev_sum=dev_sum*33+buf[i];
  dev_writes++;
}

#include "Dev"

U0 DevAtaCmd(I64 port,U64 lba,I64 cnt,I64 cmd)
{
  IoOut(port+2,cnt>>8);
  IoOut(port+3,lba>>24);
  IoOut(port+4,lba>>32);
  IoOut(port+5,lba>>40);
  IoOut(port+2,cnt);
  IoOut(port+3,lba);
  IoOut(port+4,lba>>8);
  IoOut(port+5,lba>>16);
  IoOut(port+7,cmd);
}

U0 DevDump()
{
  "%016X %016X %016X %016X\n",IoIn(0x64),IoIn(0x60),
	IoIn(0x64),IoIn(0x60);
}

U0 DevProbe()
{
  I64 i,k,port,width,cnt,cmd,mask,irq;
  U64 sum,lba=0x123456789ABC,value=0xFACEB00C;
  dev_writes=dev_sum=0;
  DevInit;
  DevRst;
  for (i=0;i<16;i++)
    "%016X\n",dev_colors[i];
  for (i=0;i<256;i+=7) {
    IoOut(0x3C8,i);
    IoOut(0x3C9,i);IoOut(0x3C9,63);IoOut(0x3C9,21);
    IoOut(0x3C7,i);
    "%016X %016X %016X %016X\n",IoIn(0x3C9),IoIn(0x3C9),
	  IoIn(0x3C9),IoIn(0x3C8);
  }
  for (i=0;i<128;i++) {
    IoOut(0x70,i|0x80);
    "%016X\n",IoIn(0x71);
  }
  IoOut(0x20,0x11);IoOut(0x21,0x20);IoOut(0x21,4);IoOut(0x21,1);
  IoOut(0xA0,0x11);IoOut(0xA1,0x28);IoOut(0xA1,2);IoOut(0xA1,1);
  for (mask=0;mask<256;mask+=17) {
    IoOut(0x21,mask);IoOut(0xA1,mask^0xFF);
    for (irq=0;irq<16;irq++) {
      pic1_irr=1<<irq&0xFF;
      pic2_irr=1<<irq>>8;
      pic1_isr=pic2_isr=0;
      "%016X %016X ",PicPending,PicNext;
      "%016X %016X ",pic1_isr,pic2_isr;
      IoOut(0x20,0x20);IoOut(0xA0,0x20);
      "%016X %016X\n",pic1_isr,pic2_isr;
    }
  }
  DevRst;
  IoOut(0x64,0xAA);DevDump;
  IoOut(0x64,0xA9);DevDump;
  IoOut(0x64,0xAB);DevDump;
  IoOut(0x64,0x20);DevDump;
  IoOut(0x64,0x60);IoOut(0x60,0x47);DevDump;
  IoOut(0x64,0xD4);IoOut(0x60,0xFF);DevDump;DevDump;
  IoOut(0x64,0xD4);IoOut(0x60,0xF2);DevDump;
  IoOut(0x60,0xF3);IoOut(0x60,0x7F);DevDump;
  IoOut(0x60,0xFF);DevDump;
  InjectKey(0xE0);InjectKey(0x4D);DevDump;
  ms_byte0=8;ms_byte1=0x7F;ms_byte2=0x80;ms_has=TRUE;
  DevDump;DevDump;
  for (i=1;i<=65536;i*=16) {
    IoOut(0x43,0xB6);
    IoOut(0x42,i);IoOut(0x42,i>>8);
    for (k=0;k<4;k++) {
      IoOut(0x61,k);
      "%016X\n",dev_tone;
    }
  }
  for (port=0x170;port<=0x1F0;port+=0x80)
    for (width=2;width<=4;width*=2) {
      for (cnt=0;cnt<=257;cnt+=257) {
	DevAtaCmd(port,lba,cnt,0x24);
	"%016X %016X %016X ",dev_lba,dev_count,IoIn(port+7);
	sum=0;
	for (i=0;i<dev_count*512;i+=width)
	  sum=sum*33+IoInWidth(port,width);
	"%016X %016X\n",sum,IoIn(port+7);
      }
      for (cmd=0;cmd<256;cmd++) {
	if (cmd==0x20 || cmd==0x21 || cmd==0x24 || cmd==0x29 ||
	      cmd==0xC4 || cmd==0x30 || cmd==0x34 || cmd==0x39 ||
	      cmd==0xC5) {
	  DevAtaCmd(port,lba,2,cmd);
	  for (i=0;i<1024;i+=width)
	    if (ata_wr) IoOutWidth(port,value+i,width);
	    else IoInWidth(port,width);
	  "%016X %016X %016X %016X\n",dev_lba,dev_count,
		dev_writes,dev_sum;
	}
      }
      DevAtaCmd(port,7,1,0x34);
      IoOutWidth(port,0xABCD,width);
      IoOut(port+7,0);
      "%016X %016X\n",IoIn(port+7),dev_writes;
    }
  IoOut(0x64,0xD4);IoOut(0x60,0xFF);
  IoOut(0x60,0xF3);IoOut(0x60,0x7F);InjectKey(0x1E);
  DevAtaCmd(0x1F0,9,1,0x34);
  IoOutWidth(0x1F0,0xABCD,2);
  IoOut(0x61,3);
  DevRst;
  "%016X %016X %016X %016X %016X\n",IoIn(0x1F7),
	IoIn(0x64),IoIn(0x60),dev_tone,PicPending;
  Free(ata_buf);
}
DevProbe;
