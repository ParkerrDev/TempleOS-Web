CTask *tm_worker_task=NULL;
I64 tm_worker_x,tm_worker_y,tm_worker_old_x,tm_worker_old_y,
      tm_worker_tic,tm_worker_old_tic,tm_worker_state;

I64 TmWorkerMember(U8 *class_name,U8 *member)
{//Read the actual native class layout after file-based compilation.
  CHashClass *tmpc=HashFind(class_name,tm_worker_task->hash_table,HTT_CLASS);
  CMemberLst *tmpm;
  if (!tmpc || !(tmpm=MemberFind(member,tmpc))) throw('Member');
  return tmpm->offset;
}

U0 TmWorkerProbe()
{//CPU zero owns the game; the compositor only reads its published frame.
  U8 *play,*game,*level,*world,*actor,*(*actor_get)(U8 *,I64,Bool);
  I64 play_game,game_level,level_world,world_player,world_tic,actor_x,actor_y;
  CHashFun *draw,*get;
  tm_worker_state=0;
  if (!TaskValidate(tm_worker_task)) return;
  draw=HashFind("PlayDrawIt",tm_worker_task->hash_table,HTT_FUN);
  get=HashFind("WorldActorGet",tm_worker_task->hash_table,HTT_FUN);
  if (!draw || !get) return;
  actor_get=get->exe_addr;
  play_game=TmWorkerMember("Play","game");
  game_level=TmWorkerMember("Game","level");
  level_world=TmWorkerMember("Level","world");
  world_player=TmWorkerMember("World","player");
  world_tic=TmWorkerMember("World","tic");
  actor_x=TmWorkerMember("Actor","x");
  actor_y=TmWorkerMember("Actor","y");
  PUSHFD
  CLI
  if (tm_worker_task->draw_it==draw->exe_addr &&
      (play=tm_worker_task->user_data)) {
    game=*(play+play_game)(U8 **);
    level=*(game+game_level)(U8 **);
    world=*(level+level_world)(U8 **);
    if (actor=(*actor_get)(world,*(world+world_player)(I64 *),FALSE)) {
      tm_worker_x=*(actor+actor_x)(I64 *);
      tm_worker_y=*(actor+actor_y)(I64 *);
      tm_worker_tic=*(world+world_tic)(I64 *);
      tm_worker_state=1;
    }
  }
  POPFD
}

U0 TmWorkerMove()
{//Keep the physical key held until a simulation tic consumes it.
  F64 end=tS+3;
  do {
    TmWorkerProbe;
    if (tm_worker_state && (tm_worker_x!=tm_worker_old_x ||
	  tm_worker_y!=tm_worker_old_y)) return;
    Sleep(1);
  } while (tS<end);
  throw('Move');
}
