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
