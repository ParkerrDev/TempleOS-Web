//Native compiler probe with only CPU storage and memory access supplied.
#define reg fpu_reg
#define F_CF 1
#define F_PF 4
#define F_ZF 0x40
#define F_AF 0x10
#define F_SF 0x80
#define F_OF 0x800
U64 reg[16],rfl,x87_cw=0x37F,x87_sw,ea,rg,rm;
I64 fsp;
Bool isMem;
F64 fpr[8];

U64 RdMem(U64 addr,I64 size)
{
  switch (size) {
    case 1: return *addr(U8 *);
    case 2: return *addr(U16 *);
    case 4: return *addr(U32 *);
  }
  return *addr(U64 *);
}

U0 WrMem(U64 addr,I64 size,U64 value)
{
  switch (size) {
    case 1: *addr(U8 *)=value; break;
    case 2: *addr(U16 *)=value; break;
    case 4: *addr(U32 *)=value; break;
    case 8: *addr(U64 *)=value;
  }
}

U64 SignExtTo64(U64 value,I64 size)
{
  if (size==2) return value(I16);
  if (size==4) return value(I32);
  return value;
}

U0 DecodeModRM()
{
}

#include "Fpu"

U64 fpu_bits[8]={0,0x8000000000000000,0x3FF4000000000000,
	0xC021000000000000,0x7FF0000000000000,0xFFF0000000000000,
	0x7FF8000000000021,0xFFF8000000000021};

U0 FpuNative()
{
  I64 i,j,mode;
  U64 mem_value;
  F64 value,arg;
  for (i=0;i<8;i++) {
    value=BitsToF64(fpu_bits[i]);
    "BITS %016X\n",F64ToBits(value);
    fsp=i;FStset(0,value);rg=4;rm=1;isMem=FALSE;
    OpX87(0xD9);
    "ABS %016X\n",F64ToBits(FStv(0));
  }
  for (i=0;i<16;i++)
    for (j=0;j<6;j++) {
      value=ToF64(i-8)/8.0;arg=ToF64(j+1)/4.0;
      mode=j;
      if (j>=2) mode+=2;
      "MATH %016X\n",F64ToBits(FArith(mode,value,arg));
    }
  for (i=-19;i<=19;i++)
    for (mode=0;mode<4;mode++)
      "ROUND %016X\n",F64ToBits(FIntRound(ToF64(i)/2.0,mode));
  for (i=0;i<8;i++) {
    fsp=i;FStset(0,2.5);x87_cw=0x37F;
    mem_value=0;ea=&mem_value;rg=7;rm=0;isMem=TRUE;
    OpX87(0xDF);
    "STORE %016X %d\n",mem_value,fsp;
  }
  for (i=0;i<7;i++) {
    fsp=0;FpuConst(i);
    "CONST %016X %d\n",F64ToBits(FStv(0)),fsp;
  }
  fsp=0;FStset(0,-1.0);FStset(1,1.0);FpuMath(6,3);
  "ARG %d\n",Abs(FStv(0)-3.0*pi/4.0)<1e-13;
}

FpuNative;
