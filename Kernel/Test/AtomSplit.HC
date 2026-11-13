asm {
_ATOM_SPLIT_RUN::
  PUSH RBP
  MOV RBP,RSP
  PUSH R12
  PUSH R13
  PUSH RBX
  PUSH RDI
  PUSH RDX
  PUSH RCX
  PUSHFD
  MOV R12,SF_ARG1[RBP]
  MOV RDI,SF_ARG2[RBP]
  MOV R13,SF_ARG3[RBP]
  MOV RAX,U64 [R13]
  MOV RDX,U64 8[R13]
  MOV RBX,U64 16[R13]
  MOV RCX,U64 24[R13]
  PUSH U64 32[R13]
  POPFD
  CALL R12
  MOV U64 [R13],RAX
  MOV U64 8[R13],RDX
  MOV U64 16[R13],RBX
  MOV U64 24[R13],RCX
  PUSHFD
  POP U64 32[R13]
  POPFD
  POP RCX
  POP RDX
  POP RDI
  POP RBX
  POP R13
  POP R12
  POP RBP
  RET1 24
}

_extern _ATOM_SPLIT_RUN U0 AtomSplitRun(U8 *code,U8 *addr,U64 *r);

U0 AtomSplit()
{//Native locked fields crossing eight-byte and cache-line boundaries.
  I64 size,op,offset,seed,n,i;
  U64 mask,sign,value,arg,acc,flags,r[5];
  U8 buf[256],*base=(buf+64)(U64)&~63,*p,code[8];
  for (size=2;size<=8;size*=2)
    for (op=0;op<=14;op++)
      if (op<14 || size==8)
	for (offset=7;offset<=63;offset=offset*2+1)
	  for (seed=0;seed<3;seed++) {
	    mask=0xFFFFFFFFFFFFFFFF>>(64-size*8);
	    sign=1(U64)<<(size*8-1);
	    value=0;arg=mask;flags=0x202;
	    if (seed==1) {value=sign-1;arg=1;flags=0xAD7;}
	    else if (seed==2) {value=mask;arg=0x12345678&mask;}
	    acc=~value;
	    if (seed==2) acc=value;
	    MemSet(buf,0xA5,sizeof(buf));
	    for (i=0;i<128;i++) base[i]=i*29+seed*137;
	    p=base+offset;
	    *p(U64 *)=value;
	    r[0]=acc;r[1]=arg;
	    r[2]=0x0123456789ABCDEF;r[3]=0xFEDCBA9876543210;
	    r[4]=flags;
	    if (op==14) {
	      r[0]=0xA123456700000000|acc&0xFFFFFFFF;
	      r[1]=0xD123456700000000|value>>32;
	    }
	    n=0;
	    if (op!=11) code[n++]=0xF0;
	    if (size==2) code[n++]=0x66;
	    else if (size==8 && op!=14) code[n++]=0x48;
	    if (op<7) {code[n++]=op*8+1;code[n++]=0x17;}
	    else if (op<=10) {
	      if (op<=8) code[n++]=0xFF;
	      else code[n++]=0xF7;
	      code[n++]=7+(op-7)*8;
	    } else if (op==11) {code[n++]=0x87;code[n++]=0x17;}
	    else {
	      code[n++]=0x0F;
	      if (op==12) {code[n++]=0xC1;code[n++]=0x17;}
	      else if (op==13) {code[n++]=0xB1;code[n++]=0x17;}
	      else {code[n++]=0xC7;code[n++]=0x0F;}
	    }
	    code[n]=0xC3;
	    AtomSplitRun(code,p,r);
	    "%d %d %d %d ",size,op,offset,seed;
	    for (i=0;i<4;i++) "%016X ",r[i];
	    flags=0xED5;
	    if (op==1 || op==4 || op==6) flags=0xEC5;
	    "%016X ",r[4]&flags;
	    for (i=-8;i<16;i++) "%02X",p[i];
	    '\n';
	  }
}

AtomSplit;
