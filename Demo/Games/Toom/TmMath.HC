U0 WideMul(U64 a,U64 b,U64 *_low,U64 *_high)
{//Unsigned 128-bit product, expressed with native 64-bit operations.
  U64 a0=a&0xFFFFFFFF,a1=a>>32,b0=b&0xFFFFFFFF,b1=b>>32,
	w0=a0*b0,t=a1*b0+w0>>32,w1=t&0xFFFFFFFF,w2=t>>32;
  w1+=a0*b1;
  *_high=a1*b1+w2+w1>>32;
  *_low=w1<<32|w0&0xFFFFFFFF;
}

I64 ProductCmp(I64 a,I64 b,I64 c,I64 d)
{//Compare signed products without overflowing at distant map coordinates.
  U64 low1,high1,low2,high2;
  I64 res;
  Bool neg1=a && b && (a<0 ^^ b<0),neg2=c && d && (c<0 ^^ d<0);
  if (-0x80000000<=a<=0x7FFFFFFF && -0x80000000<=b<=0x7FFFFFFF &&
	-0x80000000<=c<=0x7FFFFFFF && -0x80000000<=d<=0x7FFFFFFF)
    return SignI64(a*b-c*d);
  if (neg1!=neg2) {
    if (neg1) return -1;
    return 1;
  }
  WideMul(AbsI64(a),AbsI64(b),&low1,&high1);
  WideMul(AbsI64(c),AbsI64(d),&low2,&high2);
  if (high1<high2 || high1==high2 && low1<low2) res=-1;
  else if (high1>high2 || high1==high2 && low1>low2) res=1;
  else res=0;
  if (neg1) res=-res;
  return res;
}

I64 Fraction16(U64 num,U64 den)
{//Exact floor of a unit fraction times 65536, without a wide divide.
  I64 i,res=0;
  if (!den || num>den) throw('Fraction');
  if (num==den) return 65536;
  if (num<=0xFFFFFFFFFFFF) return num<<16/den;
  for (i=0;i<16;i++) {
    res<<=1;
    if (num>=den-num) {
      num-=den-num; res++;
    } else
      num<<=1;
  }
  return res;
}

I64 FixedMul(I64 a,I64 b)
{//The Q16 result retains the original signed 32-bit value range.
  I64 res=(a*b)>>16;
  return res.i32[0];
}

I64 FixedDiv(I64 a,I64 b)
{
  if (AbsI64(a)>>14>=AbsI64(b)) {
    if (a^b<0) return I32_MIN;
    return I32_MAX;
  }
  return a*65536/b;
}

I64 DistanceApprox(I64 dx,I64 dy)
{//The classic inexpensive distance used by movement and targeting.
  dx=AbsI64(dx); dy=AbsI64(dy);
  return dx+dy-MinI64(dx,dy)>>1;
}

I64 AngleSin(GameData *tmpd,I64 angle)
{
  return tmpd->sine[angle>>19&8191];
}

I64 AngleCos(GameData *tmpd,I64 angle)
{//The original cosine extension has twelve distinct rounding entries.
  return tmpd->sine[angle>>19&8191+2048];
}

I64 SlopeIndex(I64 num,I64 den)
{//A wide numerator keeps distant points from overflowing a 32-bit shift.
  if (den<512) return 2048;
  return MinI64(num<<3/den>>8,2048);
}

I64 AngleFrom(GameData *tmpd,I64 x,I64 y)
{//Eight octants use the original integer arctangent samples and ties.
  I64 angle;
  if (!x && !y) return 0;
  if (x>=0) {
    if (y>=0) {
      if (x>y) angle=tmpd->angle[SlopeIndex(y,x)];
      else angle=0x40000000-1-tmpd->angle[SlopeIndex(x,y)];
    } else {
      y=-y;
      if (x>y) angle=-tmpd->angle[SlopeIndex(y,x)];
      else angle=0xC0000000+tmpd->angle[SlopeIndex(x,y)];
    }
  } else {
    x=-x;
    if (y>=0) {
      if (x>y) angle=0x80000000-1-tmpd->angle[SlopeIndex(y,x)];
      else angle=0x40000000+tmpd->angle[SlopeIndex(x,y)];
    } else {
      y=-y;
      if (x>y) angle=0x80000000+tmpd->angle[SlopeIndex(y,x)];
      else angle=0xC0000000-1-tmpd->angle[SlopeIndex(x,y)];
    }
  }
  return angle&0xFFFFFFFF;
}
