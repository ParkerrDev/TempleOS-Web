#exe {Option(OPTf_KEEP_PRIVATE,ON);}
#include "::/Kernel/KernelA.HH"
#include "::/Compiler/CompilerA.HH"
#exe {Option(OPTf_EXTERNS_TO_IMPORTS,ON);}
#include "::/Kernel/KernelB.HH"
#include "::/Kernel/KernelC.HH"
#exe {
  Option(OPTf_EXTERNS_TO_IMPORTS,OFF);
  Option(OPTf_KEEP_PRIVATE,OFF);
}

import U0 SndTaskEndCB();
import CTaskSettings *SettingsPush(CTask *task=NULL,I64 flags=0);
import U0 SettingsPop(CTask *task=NULL,I64 flags=0);
import U0 WinMax(CTask *task=NULL);
import Bool WinBorder(Bool val=OFF,CTask *task=NULL);
import U0 Refresh(I64 cnt=1,Bool force=FALSE);
import U0 DocClear(CDoc *doc=NULL,Bool clear_holds=FALSE);
import Bool DocCursor(Bool show=OFF,CDoc *doc=NULL);
import Bool AutoComplete(Bool val=OFF);
import I64 GrPrint(CDC *dc,I64 x,I64 y,U8 *fmt,...);
import I64 GrRect(CDC *dc,I64 x,I64 y,I64 w,I64 h);
import I64 GrBlot(CDC *dc,I64 x,I64 y,CDC *img);
import CDC *DCNew(I64 width,I64 height,CTask *task=NULL,
      Bool null_bitmap=FALSE);
import U0 DCDel(CDC *dc);
