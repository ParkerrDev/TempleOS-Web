// Browser package entry. Build the Freedoom IWAD from bounded upload parts.
#exe {Cd(__DIR__);}
U0 PrepareFreedoom()
{
  U8 *all=MAlloc(27284988), *part;
  I64 i,n,offset=0;
  U8 name[32];
  for(i=0;i<7;i++) {
    StrPrint(name,"Freedoom%02d.BIN",i);
    part=FileRead(name,&n);
    if (!part || n<=0 || n>4194304 || offset+n>27284988) { Free(part); Free(all); throw('Package'); }
    MemCpy(all+offset,part,n); offset+=n; Free(part);
  }
  if(offset!=27284988) { Free(all); throw('Package'); }
  if(!FileWrite("freedoom1.wad",all,offset)) { Free(all); throw('Disk'); }
  Free(all);
}
PrepareFreedoom;
FramePtrAdd("USE_IWAD",StrNew("freedoom1.wad"));
#include "SinglePlayer.HC";
