U0 TmWorkerStartup()
{//Save timestamps from the task's private instrumented package.
  CHashGlblVar *tmpv;
  if (!TaskValidate(tm_worker_task)) throw('Startup');
  tmpv=HashFind("tm_start_times",tm_worker_task->hash_table,HTT_GLBL_VAR);
  if (!tmpv) throw('Marks');
  if (FileWrite("C:/TOOM/STARTUP.BIN",tmpv->data_addr,256*sizeof(F64))<0)
    throw('Write');
}
