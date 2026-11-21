//8088 operations used by the PCjr King's Quest interpreter. All addresses
//below belong to the game's private megabyte, including the interrupt table.
#define KQ_CF 1
#define KQ_PF 4
#define KQ_AF 16
#define KQ_ZF 64
#define KQ_SF 128
#define KQ_IF 512
#define KQ_DF 1024
#define KQ_OF 2048
U8 *kq_ram;
U16 kq_r[8],kq_s[4],kq_ip,kq_flags,kq_at;
I64 kq_mod,kq_field,kq_rm,kq_ea,kq_eoff,kq_seg,kq_repeat,kq_fault,kq_wait;
extern U0 KqBios(I64 n);
extern I64 KqIn(I64 port);
extern U0 KqOut(I64 port,I64 val);

I64 KqAddr(I64 seg,I64 off)
{
  return ((seg<<4)+(off&65535))&0xFFFFF;
}

I64 KqWord(I64 addr)
{
  return kq_ram[addr]+(kq_ram[(addr+1)&0xFFFFF]<<8);
}

U0 KqWordPut(I64 addr,I64 val)
{
  kq_ram[addr]=val;kq_ram[(addr+1)&0xFFFFF]=val>>8;
}

I64 KqByte()
{
  return kq_ram[KqAddr(kq_s[1],kq_ip++)];
}

I64 KqImm(I64 wide)
{
  I64 a=KqByte();
  if (wide) a+=KqByte()<<8;
  return a;
}

I64 KqSign(I64 x,I64 wide)
{
  I64 bit=128;
  if (wide) bit=32768;
  return (x^bit)-bit;
}

I64 KqReg(I64 r,I64 wide)
{
  if (wide) return kq_r[r];
  if (r&4) return kq_r[r&3]>>8;
  return kq_r[r]&255;
}

U0 KqSetReg(I64 r,I64 wide,I64 v)
{
  if (wide) kq_r[r]=v;
  else if (r&4) kq_r[r&3]=(kq_r[r&3]&255)|((v&255)<<8);
  else kq_r[r]=(kq_r[r]&0xFF00)|(v&255);
}

U0 KqPush(I64 v)
{
  kq_r[4]-=2;KqWordPut(KqAddr(kq_s[2],kq_r[4]),v);
}

I64 KqPop()
{
  I64 v=KqWord(KqAddr(kq_s[2],kq_r[4]));
  kq_r[4]+=2;
  return v;
}

U0 KqDecode()
{
  I64 b=KqByte(),s=3,off=0;
  kq_mod=b>>6;kq_field=(b>>3)&7;kq_rm=b&7;
  if (kq_mod==3) return;
  switch (kq_rm) {
    case 0: off=kq_r[3]+kq_r[6];break;
    case 1: off=kq_r[3]+kq_r[7];break;
    case 2: off=kq_r[5]+kq_r[6];s=2;break;
    case 3: off=kq_r[5]+kq_r[7];s=2;break;
    case 4: off=kq_r[6];break;
    case 5: off=kq_r[7];break;
    case 6:
      if (kq_mod) {off=kq_r[5];s=2;} else off=KqImm(1);
      break;
    case 7: off=kq_r[3];break;
  }
  if (kq_mod==1) off+=KqSign(KqByte(),0);
  if (kq_mod==2) off+=KqImm(1);
  if (kq_seg>=0) s=kq_seg;
  kq_eoff=off&65535;kq_ea=KqAddr(kq_s[s],off);
}

I64 KqOperand(I64 wide)
{
  if (kq_mod==3) return KqReg(kq_rm,wide);
  if (wide) return KqWord(kq_ea);
  return kq_ram[kq_ea];
}

U0 KqStore(I64 wide,I64 v)
{
  if (kq_mod==3) KqSetReg(kq_rm,wide,v);
  else if (wide) KqWordPut(kq_ea,v);
  else kq_ram[kq_ea]=v;
}

U0 KqFlag(I64 mask,I64 val)
{
  if (val) kq_flags|=mask;else kq_flags&=~mask;
}

U0 KqStatus(I64 v,I64 w)
{
  I64 p=v&255,sign=128;
  if (w) sign=32768;
  p^=p>>4;p^=p>>2;p^=p>>1;
  KqFlag(KQ_PF,!(p&1));KqFlag(KQ_ZF,!v);KqFlag(KQ_SF,v&sign);
}

I64 KqAlu(I64 op,I64 a,I64 b,I64 w)
{
  I64 v=0,m=255,s=128,c=kq_flags&1;
  if (w) {m=65535;s=32768;}
  switch (op) {
    case 0:case 2:
      v=a+b;
      if (op==2) v+=c;
      KqFlag(KQ_CF,v>m);KqFlag(KQ_OF,~(a^b)&(a^v)&s);
      break;
    case 3:case 5:case 7:
      v=a-b;
      if (op==3) v-=c;
      KqFlag(KQ_CF,v<0);KqFlag(KQ_OF,(a^b)&(a^v)&s);
      break;
    case 1: v=a|b;break;
    case 4: v=a&b;break;
    case 6: v=a^b;break;
  }
  if (op==1 || op==4 || op==6) kq_flags&=~(KQ_CF|KQ_OF|KQ_AF);
  else KqFlag(KQ_AF,(a^b^v)&16);
  v&=m;KqStatus(v,w);
  return v;
}

Bool KqCondition(I64 op)
{
  I64 f=kq_flags,r=0;
  switch (op>>1) {
    case 0: r=f&KQ_OF;break;
    case 1: r=f&KQ_CF;break;
    case 2: r=f&KQ_ZF;break;
    case 3: r=f&(KQ_ZF|KQ_CF);break;
    case 4: r=f&KQ_SF;break;
    case 5: r=f&KQ_PF;break;
    case 6: r=(!(f&KQ_SF))!=(!(f&KQ_OF));break;
    case 7: r=(f&KQ_ZF) || ((!(f&KQ_SF))!=(!(f&KQ_OF)));break;
  }
  return (!!r)^(op&1);
}

U0 KqInt(I64 n)
{
  I64 addr=n*4,seg=KqWord(addr+2);
  if (seg==0xF000) {
    KqBios(n);return;
  }
  KqPush(kq_flags);KqPush(kq_s[1]);KqPush(kq_ip);
  kq_flags&=~0x300;kq_s[1]=seg;kq_ip=KqWord(addr);
}

U0 KqShift(I64 op,I64 w,I64 n)
{
  I64 m=255,s=128,v=KqOperand(w),old=v,c,i;
  if (w) {m=65535;s=32768;}
  if (!n) return;
  for (i=0;i<n;i++) {
    c=kq_flags&1;
    if (op==0 || op==2 || op==4 || op==6) {
      KqFlag(1,v&s);v=(v<<1)&m;
      if (!op) v|=kq_flags&1;
      if (op==2) v|=c;
    } else {
      KqFlag(1,v&1);v>>=1;
      if (op==1 && (kq_flags&1) || op==3 && c || op==7 && (old&s)) v|=s;
    }
  }
  if (n==1) KqFlag(KQ_OF,(old^v)&s);
  if (op>=4) KqStatus(v,w);
  KqStore(w,v);
}

U0 KqStrings(I64 op)
{
  I64 w=op&1,step=1+w,n=1,sa,da,a,b,s=3;
  if (kq_seg>=0) s=kq_seg;
  if (kq_flags&KQ_DF) step=-step;
  if (kq_repeat) n=kq_r[1];
  while (n-->0) {
    sa=KqAddr(kq_s[s],kq_r[6]);da=KqAddr(kq_s[0],kq_r[7]);
    if (w) {a=KqWord(sa);b=KqWord(da);} else {a=kq_ram[sa];b=kq_ram[da];}
    switch (op&0xFE) {
      case 0xA4:
	if (w) KqWordPut(da,a);else kq_ram[da]=a;
	kq_r[6]+=step;kq_r[7]+=step;break;
      case 0xA6: KqAlu(7,a,b,w);kq_r[6]+=step;kq_r[7]+=step;break;
      case 0xAA:
	a=KqReg(0,w);if (w) KqWordPut(da,a);else kq_ram[da]=a;
	kq_r[7]+=step;break;
      case 0xAC: KqSetReg(0,w,a);kq_r[6]+=step;break;
      case 0xAE: KqAlu(7,KqReg(0,w),b,w);kq_r[7]+=step;break;
    }
    if (kq_repeat) {
      kq_r[1]--;
      if ((op&0xFE)==0xA6 || (op&0xFE)==0xAE)
	if ((!(kq_flags&KQ_ZF))==(kq_repeat==3)) break;
    }
  }
}

U0 KqStep()
{
  I64 o,w,r,a,b,v,t,m,sub,dir,s,n,addr;
  kq_at=kq_ip;kq_seg=-1;kq_repeat=0;
  while (TRUE) {
    o=KqByte();
    if (o==0x26 || o==0x2E || o==0x36 || o==0x3E) kq_seg=(o>>3)&3;
    else if (o==0xF2 || o==0xF3) kq_repeat=o&3;
    else if (o!=0xF0) break;
  }
  w=o&1;r=o&7;sub=(o>>3)&7;dir=o&2;m=255;
  if (w) m=65535;
  if (o<0x40 && r<6) {
    if (r<4) {
      KqDecode();a=KqOperand(w);b=KqReg(kq_field,w);
      if (dir) v=KqAlu(sub,b,a,w);else v=KqAlu(sub,a,b,w);
      if (sub!=7) {
	if (dir) KqSetReg(kq_field,w,v);else KqStore(w,v);
      }
    } else {
      b=KqImm(w);v=KqAlu(sub,KqReg(0,w),b,w);
      if (sub!=7) KqSetReg(0,w,v);
    }
    return;
  }
  if (o>=0x40 && o<=0x4F) {
    t=kq_flags&1;
    if (o&8) kq_r[r]=KqAlu(5,kq_r[r],1,1);
    else kq_r[r]=KqAlu(0,kq_r[r],1,1);
    KqFlag(1,t);return;
  }
  if (o>=0x50 && o<=0x57) {KqPush(kq_r[r]);return;}
  if (o>=0x58 && o<=0x5F) {kq_r[r]=KqPop();return;}
  if (o>=0x70 && o<=0x7F) {
    v=KqSign(KqByte(),0);
    if (KqCondition(o&15)) kq_ip+=v;
    return;
  }
  if (o>=0x90 && o<=0x97) {
    a=kq_r[0];kq_r[0]=kq_r[r];kq_r[r]=a;return;
  }
  if (o>=0xB0 && o<=0xBF) {
    w=(o>>3)&1;KqSetReg(r,w,KqImm(w));return;
  }
  switch (o) {
    case 0x06:case 0x0E:case 0x16:case 0x1E: KqPush(kq_s[(o>>3)&3]);break;
    case 0x07:case 0x17:case 0x1F:kq_s[(o>>3)&3]=KqPop();break;
    case 0x80:case 0x81:case 0x82:case 0x83:
      KqDecode();a=KqOperand(w);b=KqImm(o==0x81);
      if (o==0x83) b=KqSign(b,0)&65535;
      v=KqAlu(kq_field,a,b,w);if (kq_field!=7) KqStore(w,v);
      break;
    case 0x84:case 0x85:KqDecode();KqAlu(4,KqOperand(w),KqReg(kq_field,w),w);break;
    case 0x86:case 0x87:
      KqDecode();v=KqOperand(w);KqStore(w,KqReg(kq_field,w));
      KqSetReg(kq_field,w,v);break;
    case 0x88:case 0x89:case 0x8A:case 0x8B:
      KqDecode();
      if (dir) KqSetReg(kq_field,w,KqOperand(w));else KqStore(w,KqReg(kq_field,w));
      break;
    case 0x8C:KqDecode();KqStore(1,kq_s[kq_field&3]);break;
    case 0x8D:KqDecode();kq_r[kq_field]=kq_eoff;break;
    case 0x8E:KqDecode();kq_s[kq_field&3]=KqOperand(1);break;
    case 0x8F:KqDecode();KqStore(1,KqPop());break;
    case 0x98:kq_r[0]=KqSign(kq_r[0]&255,0);break;
    case 0x99:kq_r[2]=-(kq_r[0]>>15);break;
    case 0x9A:case 0xEA:
      a=KqImm(1);b=KqImm(1);
      if (o==0x9A) {KqPush(kq_s[1]);KqPush(kq_ip);}
      kq_s[1]=b;kq_ip=a;break;
    case 0x9C:KqPush(kq_flags|0xF002);break;
    case 0x9D:kq_flags=KqPop()|2;break;
    case 0x9E:kq_flags=(kq_flags&0xFF00)|((kq_r[0]>>8)&0xD5)|2;break;
    case 0x9F:KqSetReg(4,0,(kq_flags&0xD5)|2);break;
    case 0xA0:case 0xA1:case 0xA2:case 0xA3:
      s=kq_seg;if (s<0) s=3;
      addr=KqAddr(kq_s[s],KqImm(1));
      if (dir) {
	if (w) KqWordPut(addr,kq_r[0]);else kq_ram[addr]=kq_r[0];
      } else {
	if (w) kq_r[0]=KqWord(addr);else KqSetReg(0,0,kq_ram[addr]);
      }
      break;
    case 0xA4:case 0xA5:case 0xA6:case 0xA7:case 0xAA:case 0xAB:
    case 0xAC:case 0xAD:case 0xAE:case 0xAF:KqStrings(o);break;
    case 0xA8:case 0xA9:KqAlu(4,KqReg(0,w),KqImm(w),w);break;
    case 0xC2:case 0xC3:case 0xCA:case 0xCB:
      v=0;if (!(o&1)) v=KqImm(1);
      kq_ip=KqPop();if (o&8) kq_s[1]=KqPop();
      kq_r[4]+=v;break;
    case 0xC4:case 0xC5:
      KqDecode();kq_r[kq_field]=KqWord(kq_ea);
      kq_s[w*3]=KqWord((kq_ea+2)&0xFFFFF);break;
    case 0xC6:case 0xC7:KqDecode();KqStore(w,KqImm(w));break;
    case 0xCC:KqInt(3);break;
    case 0xCD:KqInt(KqByte());break;
    case 0xCF:kq_ip=KqPop();kq_s[1]=KqPop();kq_flags=KqPop();break;
    case 0xD0:case 0xD1:case 0xD2:case 0xD3:
      KqDecode();n=1;if (dir) n=kq_r[1]&255;
      KqShift(kq_field,w,n);break;
    case 0xD4:b=KqByte();a=kq_r[0]&255;if (!b) {KqInt(0);break;}
      kq_r[0]=(a/b*256)+(a%b);KqStatus(a%b,0);break;
    case 0xD5:b=KqByte();a=((kq_r[0]>>8)*b+kq_r[0])&255;
      kq_r[0]=a;KqStatus(a,0);break;
    case 0xD7:s=kq_seg;if (s<0) s=3;
      KqSetReg(0,0,kq_ram[KqAddr(kq_s[s],kq_r[3]+(kq_r[0]&255))]);break;
    case 0xE0:case 0xE1:case 0xE2:case 0xE3:
      v=KqSign(KqByte(),0);
      if (o==0xE3) {
	if (!kq_r[1]) kq_ip+=v;
      } else if (--kq_r[1] && (o==0xE2 || (o==0xE1)==!!(kq_flags&KQ_ZF)))
	kq_ip+=v;
      break;
    case 0xE8:case 0xE9:case 0xEB:
      if (o==0xEB) v=KqSign(KqByte(),0);else v=KqImm(1);
      if (o==0xE8) KqPush(kq_ip);
      kq_ip+=v;break;
    case 0xE4:case 0xE5:case 0xE6:case 0xE7:
    case 0xEC:case 0xED:case 0xEE:case 0xEF:
      if (o&8) a=kq_r[2];else a=KqByte();
      if (dir) {
	KqOut(a,kq_r[0]&255);if (w) KqOut(a+1,kq_r[0]>>8);
      } else {
	v=KqIn(a);if (w) v+=KqIn(a+1)<<8;
	KqSetReg(0,w,v);
      }
      break;
    case 0xF5:kq_flags^=1;break;
    case 0xF6:case 0xF7:
      KqDecode();a=KqOperand(w);b=KqReg(0,w);n=8;if (w) n=16;
      switch (kq_field) {
	case 0:case 1:KqAlu(4,a,KqImm(w),w);break;
	case 2:KqStore(w,~a);break;
	case 3:KqStore(w,KqAlu(5,0,a,w));break;
	case 4:case 5:
	  if (kq_field==5) {a=KqSign(a,w);b=KqSign(b,w);}
	  v=a*b;
	  if (w) {kq_r[0]=v;kq_r[2]=v>>16;} else kq_r[0]=v;
	  t=v!=(v&m);if (kq_field==5) t=v!=KqSign(v&m,w);
	  KqFlag(1,t);KqFlag(KQ_OF,t);break;
	case 6:case 7:
	  b=kq_r[0];if (w) b+=kq_r[2]*65536;
	  if (kq_field==7) {
	    a=KqSign(a,w);t=1<<(n*2-1);b=(b^t)-t;
	  }
	  if (!a) {KqInt(0);break;}
	  v=b/a;t=b%a;
	  if (kq_field==6 && v>m || kq_field==7 && v!=KqSign(v&m,w)) {
	    KqInt(0);break;
	  }
	  KqSetReg(0,w,v);
	  if (w) kq_r[2]=t;else KqSetReg(4,0,t);
	  break;
      }
      break;
    case 0xF8:case 0xF9:KqFlag(1,w);break;
    case 0xFA:case 0xFB:KqFlag(KQ_IF,w);break;
    case 0xFC:case 0xFD:KqFlag(KQ_DF,w);break;
    case 0xFE:case 0xFF:
      KqDecode();v=KqOperand(w);
      if (kq_field<=1) {
	t=kq_flags&1;
	if (kq_field) v=KqAlu(5,v,1,w);else v=KqAlu(0,v,1,w);
	KqFlag(1,t);KqStore(w,v);
      } else if (kq_field==2 || kq_field==4) {
	if (kq_field==2) KqPush(kq_ip);
	kq_ip=v;
      } else if (kq_field==3 || kq_field==5) {
	a=KqWord((kq_ea+2)&0xFFFFF);
	if (kq_field==3) {KqPush(kq_s[1]);KqPush(kq_ip);}
	kq_s[1]=a;kq_ip=v;
      } else if (kq_field==6) KqPush(v);
      else kq_fault=o+256;
      break;
    default:kq_fault=o+256;
  }
}

U0 KqSlice(I64 count)
{//A LOOP to itself changes only CX. Count all its iterations against the slice.
  I64 n,addr;
  while (count>0 && !kq_fault && !kq_wait) {
    addr=KqAddr(kq_s[1],kq_ip);
    if (kq_ram[addr]==0xE2 && kq_ip!=0xFFFF && kq_ram[(addr+1)&0xFFFFF]==0xFE) {
      n=kq_r[1];
      if (!n) n=65536;
      if (n>count) n=count;
      kq_r[1]-=n;
      if (!kq_r[1]) kq_ip+=2;
      count-=n;
    } else {
      KqStep;
      count--;
    }
  }
}
