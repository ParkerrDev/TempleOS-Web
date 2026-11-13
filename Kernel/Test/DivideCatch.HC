U64 divide_caught[4];

I64 DivideCaught(I64 a,I64 divisor)
{//The original IntDivZero handler unwinds to this task's catch block.
  I64 res;
  try {
    res=a/divisor;
  } catch {
    res=Fs->except_ch;
    Fs->catch_except=TRUE;
  }
  return res;
}

divide_caught[0]=DivideCaught(23,0);
divide_caught[1]=DivideCaught(I64_MIN,-1);
divide_caught[2]=DivideCaught(23,1);
divide_caught[3]=DivideCaught(-23,4);
"%016X %016X %016X %016X\n",divide_caught[0],divide_caught[1],
      divide_caught[2],divide_caught[3];
