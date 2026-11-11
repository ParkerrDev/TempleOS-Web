asm {
_CMP16_RUN::
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

_extern _CMP16_RUN U0 Cmp16Run(U8 *code,U8 *addr,U64 *r);

U64 cmp16_vals[4]={0,1,0xFEDCBA9876543210,0xFFFFFFFFFFFFFFFF};

U0 Cmp16Probe()
{//Aligned 128-bit comparison with both mismatching halves.
  I64 lock,v,h,arg,match,f,i;
  U64 buf[4],*p=(buf+1)(U64)&~15,r[5];
  U8 code[6];
  CRAXRBCRCXRDX id;
  CPUId(1,&id);
  if (!Bt(&id.rcx,13)) throw('NoCX16',TRUE);
  for (lock=0;lock<2;lock++)
    for (v=0;v<4;v++)
      for (h=0;h<4;h++)
	for (arg=0;arg<4;arg++)
	  for (match=0;match<3;match++)
	    for (f=0;f<2;f++) {
	      p[0]=cmp16_vals[v];p[1]=cmp16_vals[h];
	      r[0]=p[0];r[1]=p[1];r[2]=cmp16_vals[arg];
	      r[3]=~cmp16_vals[arg];r[4]=0x202;
	      if (f) r[4]=0xAD7;
	      if (match==1) r[0]^=1;
	      if (match==2) r[1]^=1;
	      "%d %016X %016X ",lock,p[0],p[1];
	      for (i=0;i<5;i++) "%016X ",r[i];
	      code[0]=0xF0;code[1]=0x48;code[2]=0x0F;
	      code[3]=0xC7;code[4]=0x0F;code[5]=0xC3;
	      if (lock) Cmp16Run(code,p,r);
	      else Cmp16Run(code+1,p,r);
	      "%016X %016X ",p[0],p[1];
	      for (i=0;i<4;i++) "%016X ",r[i];
	      "%016X\n",r[4]&0xED5;
	    }
}

Cmp16Probe;
