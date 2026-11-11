//The native instruction fixture has private RAM and no display or disk.
I64 MyCore()
{
  return 0;
}

U0 __snap_load(U8 *)
{
  throw('NoSnap');
}

U0 __present(U8 *,I64,I64)
{
}

Bool __capture_lock()
{
  return TRUE;
}

U0 __capture_unlock()
{
}

U0 __host_palette(I64,I64)
{
}

U0 __host_disk(I64,I64,U8 *)
{
}

U0 __host_disk_wr(I64,I64,U8 *)
{
}

I64 __host_msx()
{
  return 0;
}

I64 __host_msy()
{
  return 0;
}

I64 __host_msb()
{
  return 0;
}

I64 __host_wheel()
{
  return 0;
}

I64 __host_key()
{
  return -1;
}

I64 __host_ns()
{
  return 0;
}

I64 __host_dt()
{
  return 0;
}

I64 __host_budget()
{
  return 0;
}

I64 __host_time(I64)
{
  return 0;
}

U0 __snd(F64)
{
}

I64 __jit_state(U64 *,U64 *,U64 *)
{
  return 0;
}

U0 __jit_x87(F64 *,I64 *,U64 *)
{
}

U0 __jit_seg(U64 *,U64 *,U64 *,U64 *,U64 *,U64 *)
{
}

U0 __jit_chain(U64 *,I64 *)
{
}

I64 __jit_compile(U64)
{
  return 0;
}

I64 __jit_run(U64)
{
  return 0;
}

I64 __jit_dispatch(I64)
{
  return 0;
}

I64 __ap_run(U64,I64)
{
  return 0;
}

Bool __bus_poll()
{
  return TRUE;
}

Bool __bus_lock()
{
  return FALSE;
}

U0 __bus_unlock()
{
}

I64 cpu_host_lock=0;

U64 CpuHostAtom(U8 *addr,U64 v,I64 width,I64 op,U64 nv=0)
{//One locked exchange serializes every emulated atomic width.
  U64 old,res;
  while (LXchgI64(&cpu_host_lock,1))
    Yield;
  switch (width) {
    case 1: old=*addr;break;
    case 2: old=*addr(U16 *);break;
    case 4: old=*addr(U32 *);break;
    case 8: old=*addr(U64 *);break;
  }
  switch (op) {
    case 0: res=old|v;break;
    case 1: res=old&v;break;
    case 2: res=old^v;break;
    case 3: res=old+v;break;
    case 4: res=v;break;
    case 5: res=old;if (old==v) res=nv;break;
  }
  switch (width) {
    case 1: *addr=res;break;
    case 2: *addr(U16 *)=res;break;
    case 4: *addr(U32 *)=res;break;
    case 8: *addr(U64 *)=res;break;
  }
  LXchgI64(&cpu_host_lock,0);
  return old;
}

U64 __a_or8(U8 *addr,U64 v)
{
  return CpuHostAtom(addr,v,1,0);
}

U64 __a_or16(U8 *addr,U64 v)
{
  return CpuHostAtom(addr,v,2,0);
}

U64 __a_or32(U8 *addr,U64 v)
{
  return CpuHostAtom(addr,v,4,0);
}

U64 __a_or64(U8 *addr,U64 v)
{
  return CpuHostAtom(addr,v,8,0);
}

U64 __a_and8(U8 *addr,U64 v)
{
  return CpuHostAtom(addr,v,1,1);
}

U64 __a_and16(U8 *addr,U64 v)
{
  return CpuHostAtom(addr,v,2,1);
}

U64 __a_and32(U8 *addr,U64 v)
{
  return CpuHostAtom(addr,v,4,1);
}

U64 __a_and64(U8 *addr,U64 v)
{
  return CpuHostAtom(addr,v,8,1);
}

U64 __a_xor8(U8 *addr,U64 v)
{
  return CpuHostAtom(addr,v,1,2);
}

U64 __a_xor16(U8 *addr,U64 v)
{
  return CpuHostAtom(addr,v,2,2);
}

U64 __a_xor32(U8 *addr,U64 v)
{
  return CpuHostAtom(addr,v,4,2);
}

U64 __a_xor64(U8 *addr,U64 v)
{
  return CpuHostAtom(addr,v,8,2);
}

U64 __a_add8(U8 *addr,U64 v)
{
  return CpuHostAtom(addr,v,1,3);
}

U64 __a_add16(U8 *addr,U64 v)
{
  return CpuHostAtom(addr,v,2,3);
}

U64 __a_add32(U8 *addr,U64 v)
{
  return CpuHostAtom(addr,v,4,3);
}

U64 __a_add64(U8 *addr,U64 v)
{
  return CpuHostAtom(addr,v,8,3);
}

U64 __a_xchg8(U8 *addr,U64 v)
{
  return CpuHostAtom(addr,v,1,4);
}

U64 __a_xchg16(U8 *addr,U64 v)
{
  return CpuHostAtom(addr,v,2,4);
}

U64 __a_xchg32(U8 *addr,U64 v)
{
  return CpuHostAtom(addr,v,4,4);
}

U64 __a_xchg64(U8 *addr,U64 v)
{
  return CpuHostAtom(addr,v,8,4);
}

U64 __a_cmpxchg8(U8 *addr,U64 v,U64 nv)
{
  return CpuHostAtom(addr,v,1,5,nv);
}

U64 __a_cmpxchg16(U8 *addr,U64 v,U64 nv)
{
  return CpuHostAtom(addr,v,2,5,nv);
}

U64 __a_cmpxchg32(U8 *addr,U64 v,U64 nv)
{
  return CpuHostAtom(addr,v,4,5,nv);
}

U64 __a_cmpxchg64(U8 *addr,U64 v,U64 nv)
{
  return CpuHostAtom(addr,v,8,5,nv);
}
