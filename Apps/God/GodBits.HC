#define GOD_FIFO_SIZE	1024

U8 god_fifo[GOD_FIFO_SIZE];
I64 god_head,god_tail,god_cnt;

public U0 GodFifoRst()
{//Empty the timing bit FIFO.
  god_head=god_tail=god_cnt=0;
}

public U0 GodBitsIns(I64 num_bits,I64 n)
{//Insert low bit first, as Adam/God/HolySpirit.HC does.
  while (num_bits>0 && god_cnt<GOD_FIFO_SIZE) {
    god_fifo[god_head]=n&1;
    god_head=(god_head+1)%GOD_FIFO_SIZE;
    god_cnt++;
    n>>=1;
    num_bits--;
  }
}

public I64 GodBits(I64 num_bits)
{//Remove high bit first. A missing seed is an error to the caller.
  I64 res=0;
  if (num_bits<0 || num_bits>63 || num_bits>god_cnt)
    return -1;
  while (num_bits--) {
    res=res*2+god_fifo[god_tail];
    god_tail=(god_tail+1)%GOD_FIFO_SIZE;
    god_cnt--;
  }
  return res;
}

GodFifoRst;
