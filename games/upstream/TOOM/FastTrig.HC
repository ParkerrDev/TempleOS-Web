#ifndef  FAST_TRIG
#define FAST_TRIG "fast"
#define FCos Cos
#define FSin Sin
#define FArg Arg
#endif
F64 ApproxDist(F64 a,F64 b) {
  return Sqrt(a*a+b*b);
}