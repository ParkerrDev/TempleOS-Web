I64 tm_worker_stage,tm_worker_result_state,tm_worker_result_phase,
      tm_worker_map,tm_worker_play_busy,tm_worker_game_busy,
      tm_worker_frames,tm_worker_clock,tm_worker_world_tic;

U0 TmWorkerProgress()
{
  U8 *play,*game,*level,*result,*world;
  I64 play_stage,play_game,game_level,level_map,play_result,result_phase,
	result_state,play_flags,game_flags,play_frames,game_clock,
	level_world,world_tic;
  tm_worker_stage=tm_worker_result_state=tm_worker_result_phase=-1;
  tm_worker_map=0;
  if (!TaskValidate(tm_worker_task)) return;
  play_stage=TmWorkerMember("Play","stage");
  play_game=TmWorkerMember("Play","game");
  game_level=TmWorkerMember("Game","level");
  level_map=TmWorkerMember("Level","map_num");
  play_result=TmWorkerMember("Play","result");
  result_phase=TmWorkerMember("Intermission","phase");
  result_state=TmWorkerMember("Intermission","state");
  play_flags=TmWorkerMember("Play","flags");
  game_flags=TmWorkerMember("Game","flags");
  play_frames=TmWorkerMember("Play","frames");
  game_clock=TmWorkerMember("Game","clock");
  level_world=TmWorkerMember("Level","world");
  world_tic=TmWorkerMember("World","tic");
  PUSHFD
  CLI
  if (play=tm_worker_task->user_data) {
    game=*(play+play_game)(U8 **); level=*(game+game_level)(U8 **);
    result=play+play_result;
    tm_worker_stage=*(play+play_stage)(I64 *);
    tm_worker_result_state=*(result+result_state)(I64 *);
    tm_worker_result_phase=*(result+result_phase)(I64 *);
    tm_worker_map=*(level+level_map)(I64 *);
    world=*(level+level_world)(U8 **);
    tm_worker_play_busy=*(play+play_flags)(I64 *);
    tm_worker_game_busy=*(game+game_flags)(I64 *);
    tm_worker_frames=*(play+play_frames)(I64 *);
    tm_worker_clock=*(game+game_clock)(I64 *);
    tm_worker_world_tic=*(world+world_tic)(I64 *);
  }
  POPFD
}

U0 TmWorkerProgressWait(I64 stage,I64 state,I64 phase,I64 map_num)
{
  F64 end=tS+60;
  do {
    TmWorkerProgress;
    if (tm_worker_stage==stage && tm_worker_map==map_num &&
	  (state<0 || tm_worker_result_state==state) &&
	  (phase<0 || tm_worker_result_phase==phase)) return;
    Sleep(10);
  } while (tS<end);
  throw('Progress');
}
