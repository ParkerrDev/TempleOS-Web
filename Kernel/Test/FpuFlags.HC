asm {
_FPU_FLAGS::
  PUSH RBP
  MOV RBP,RSP
  DU8 0xDB,0xE3; //FNINIT without waiting for a pending exception.
  FLD U64 SF_ARG3[RBP]
  FLD U64 SF_ARG2[RBP]
  DU8 0xDB,0xE2; //FNCLEX after loading the operands.
  FLDCW U16 SF_ARG4[RBP]
  CMP U64 SF_ARG1[RBP],0
  JZ @@10
  CMP U64 SF_ARG1[RBP],1
  JZ @@20
  CMP U64 SF_ARG1[RBP],2
  JZ @@30
  PUSH U64 SF_ARG5[RBP]
  POPFD
  DU8 0xDF,0xE9; //FUCOMIP ST0,ST1.
  JMP @@40
@@10:
  PUSH U64 SF_ARG5[RBP]
  POPFD
  DU8 0xDB,0xF1; //FCOMI ST0,ST1.
  JMP @@40
@@20:
  PUSH U64 SF_ARG5[RBP]
  POPFD
  DU8 0xDB,0xE9; //FUCOMI ST0,ST1.
  JMP @@40
@@30:
  PUSH U64 SF_ARG5[RBP]
  POPFD
  DU8 0xDF,0xF1; //FCOMIP ST0,ST1.
@@40:
  PUSHFD
  POP RAX
  MOV RDX,U64 SF_ARG6[RBP]
  MOV U64 [RDX],RAX
  DU8 0xDF,0xE0; //FNSTSW AX, without delivering the pending exception.
  MOVZX RAX,AX
  MOV U64 8[RDX],RAX
  DU8 0xDB,0xE3;
  POP RBP
  RET1 48
}

_extern _FPU_FLAGS U0 FpuFlags(I64 op,U64 arg1,U64 arg2,U64 cw,
	U64 flags,U64 *res);

U0 FpuFlagsCheck()
{
  I64 op,mask,set;
  U64 flags,cw,res[2];
  for (op=0;op<4;op++)
    for (mask=0;mask<2;mask++)
      for (set=0;set<2;set++) {
	cw=0x37E|mask;
	if (set) flags=0xAD7;
	else flags=0xA92;
	FpuFlags(op,0,0x7FF8000000000021,cw,flags,res);
	"FLAGS %d %X %X %X %X %d\n",op,cw,flags,
	      res[0]&0x8D5,res[1]&0x8081,res[1]>>11&7;
      }
}

FpuFlagsCheck;
