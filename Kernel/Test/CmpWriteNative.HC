asm {
_CMP_WRITE_RUN::
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

_extern _CMP_WRITE_RUN U0 CmpWriteRun(U8 *code,U8 *addr,U64 *r);

U0 CmpWriteNative()
{//Memory write cycles must not become failed register-destination writes.
  I64 kind,size,v,match,seed,i,n;
  U64 value,mask,r[5];
  U8 code[6];
  for (kind=0;kind<3;kind++)
    for (size=1;size<=8;size*=2)
      if (kind<2 || size==8)
	for (v=0;v<2;v++)
	  for (match=0;match<2;match++)
	    for (seed=0;seed<2;seed++) {
	      value=0;
	      if (v) value=0xD123456789ABCDEF;
	      mask=0xFFFFFFFFFFFFFFFF>>(64-size*8);
	      r[0]=0xA123456789ABCDEF&~mask|value&mask;
	      r[1]=0xD1234567ABCDEF01;
	      r[2]=0xB1234567AABBCCDD;r[3]=0xC123456788776655;
	      r[4]=0x202;
	      if (seed) r[4]=0xAD7;
	      if (kind==1) r[1]=value;
	      if (kind==2) {
		r[0]=0xA123456700000000|value&0xFFFFFFFF;
		r[1]=0xD123456700000000|value>>32;
	      }
	      if (!match) r[0]^=1;
	      "%d %d %d %d %d %016X ",kind,size,v,match,seed,value;
	      for (i=0;i<5;i++) "%016X ",r[i];
	      n=0;
	      if (size==2) code[n++]=0x66;
	      else if (size==8 && kind<2) code[n++]=0x48;
	      code[n++]=0x0F;
	      if (kind==2) code[n++]=0xC7;
	      else if (size==1) code[n++]=0xB0;
	      else code[n++]=0xB1;
	      if (kind==1) code[n++]=0xCA;
	      else code[n++]=0x0F;
	      code[n]=0xC3;
	      CmpWriteRun(code,&value,r);
	      "%016X ",value;
	      for (i=0;i<4;i++) "%016X ",r[i];
	      "%016X\n",r[4]&0xED5;
	    }
}

CmpWriteNative;
