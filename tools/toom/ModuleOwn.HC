U0 TmModuleOwnTest()
{//The native module belongs to a fresh child, never the caller's heap.
  I64 i,used=Fs->data_heap->used_u8s,code=Fs->code_heap->used_u8s,
	result[3];
  CTask *caller=Fs,*child;
  for (i=0;i<2;i++) {
    MemSet(result,0,sizeof(result));
    PopUpPrint("*(0x%X)(I64*)=Fs;*(0x%X)(I64*)=Fs->task_num;"
	  "Cd(\"C:/ORACLE\");try {Load(\"TOOM.BIN\");"
	  "*(0x%X)(I64*)=1;} catch {*(0x%X)(I64*)=-Fs->except_ch;"
	  "Fs->catch_except=TRUE;}",result,result+2,result+1,result+1);
    child=result[0];
    if (result[1]!=1) throw('Module');
    if (Fs!=caller || !TaskValidate(caller) || Fs->popup_task)
      throw('Caller');
    if (TaskValidate(child) && child->task_num==result[2]) throw('Child');
    if (Fs->data_heap->used_u8s!=used || Fs->code_heap->used_u8s!=code)
      throw('Heap');
  }
  "MODULE OWNER 2 LOADS BAD 0\n";
}

TmModuleOwnTest;
