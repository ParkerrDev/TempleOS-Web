I64 tm_worker_final_stage,tm_worker_final_tic,tm_worker_cast_num,
	tm_worker_cast_death,tm_worker_old_final,tm_worker_old_frames;
Bool tm_worker_final_paused;

U0 TmWorkerFinale()
{
  U8 *play,*finale,*cast;
  I64 play_finale,play_cast,final_stage,final_tic,cast_num,cast_death,
	play_paused;
  TmWorkerProgress;
  tm_worker_final_stage=tm_worker_cast_num=-1;
  if (!TaskValidate(tm_worker_task)) return;
  play_finale=TmWorkerMember("Play","finale");
  play_cast=TmWorkerMember("Play","cast");
  play_paused=TmWorkerMember("Play","paused");
  final_stage=TmWorkerMember("Finale","stage");
  final_tic=TmWorkerMember("Finale","tic");
  cast_num=TmWorkerMember("Cast","num");
  cast_death=TmWorkerMember("Cast","death");
  PUSHFD
  CLI
  if (play=tm_worker_task->user_data) {
    finale=play+play_finale; cast=play+play_cast;
    tm_worker_final_stage=*(finale+final_stage)(I64 *);
    tm_worker_final_tic=*(finale+final_tic)(I64 *);
    tm_worker_cast_num=*(cast+cast_num)(I64 *);
    tm_worker_cast_death=*(cast+cast_death);
    tm_worker_final_paused=*(play+play_paused);
  }
  POPFD
}

U0 TmWorkerFinalePause()
{
  F64 end=tS+60;
  do {
    TmWorkerFinale;
    if (tm_worker_stage==2 && tm_worker_final_paused) return;
    Sleep(10);
  } while (tS<end);
  throw('Pause');
}

U0 TmWorkerFinaleWait(I64 stage,I64 map_num,I64 cast_num=-1,
	I64 death=-1)
{
  F64 end=tS+60;
  do {
    TmWorkerFinale;
    if (tm_worker_stage==2 && tm_worker_map==map_num &&
	  tm_worker_final_stage==stage &&
	  (cast_num<0 || tm_worker_cast_num==cast_num) &&
	  (death<0 || tm_worker_cast_death==death)) return;
    Sleep(10);
  } while (tS<end);
  throw('Finale');
}

U0 TmWorkerFinaleFrame()
{
  F64 end=tS+60;
  TmWorkerFinale; tm_worker_old_frames=tm_worker_frames;
  do {
    TmWorkerFinale;
    if (tm_worker_frames>tm_worker_old_frames) return;
    Sleep(10);
  } while (tS<end);
  throw('Frame');
}
