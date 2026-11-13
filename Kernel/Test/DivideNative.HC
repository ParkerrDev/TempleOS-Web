#include "DivideEntry"

U0 DivideNative()
{//Capture the processor's frame before a HolyC handler prologue.
  I64 size,sign,kind,align,gate,seed,n,id=0,i;
  U64 mask,bit,a,d,divisor,flags,old_gate[2],*r=divide_record;
  U8 code[8],*sp;
  MemCpy(old_gate,dev.idt,16);
  for (size=1;size<=8;size*=2)
    for (sign=0;sign<2;sign++)
      for (kind=0;kind<3;kind++) {
	mask=0xFFFFFFFFFFFFFFFF;
	if (size<8) mask=1(U64)<<(size*8)-1;
	bit=1(U64)<<(size*8-1);
	a=23;d=0;divisor=0;
	if (kind==1) {
	  if (sign) a=bit;
	  else {a=0;d=1;}
	  divisor=1;
	} else if (kind==2) {
	  if (sign) a=bit;
	  else a=mask;
	  d=divisor=mask;
	}
	if (size==1) {
	  a=a&mask|d<<8&0xFF00;
	  a|=0xA123456789AB0000;
	  d=0xD123456789ABCDEF;
	} else {
	  a|=0xA123456789ABCDEF&~mask;
	  d|=0xD123456789ABCDEF&~mask;
	}
	n=0;
	if (size==2) code[n++]=0x66;
	else if (size==8) code[n++]=0x48;
	if (size==1) code[n++]=0xF6;
	else code[n++]=0xF7;
	code[n++]=0xF1+sign*8;
	code[n]=0xC3;
	for (align=0;align<16;align++)
	  for (gate=0;gate<2;gate++)
	    for (seed=0;seed<2;seed++) {
	      IntEntrySet(I_DIV_ZERO,DIVIDE_ENTRY,IDTET_IRQ+gate);
	      MemSet(r,0,sizeof(divide_record));
	      r[10]=code+n;
	      sp=(divide_stack+sizeof(divide_stack)-32)(U64)&~15;
	      sp+=align;
	      flags=2;
	      if (seed) flags=0xED7;
	      DivideRun(r,sp,code,a,d,divisor,flags);
	      "%d %d %d %d %d %d %d ",id++,size,sign,kind,align,gate,seed;
	      "%d %d %d ",r[0]-r[8],r[5]-code,r[8]-(sp-8);
	      for (i=1;i<=7;i++) {
		if (i!=5) "%016X ",r[i];
	      }
	      "%016X\n",r[9];
	    }
      }
  MemCpy(dev.idt,old_gate,16);
}

DivideNative;
