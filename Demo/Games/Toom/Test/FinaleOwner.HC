U0 TmFinaleOwner(I64 map_num)
{//Reach the ending at the native owner boundary, retaining the real map load.
  Play *play=Fs->user_data;
  if (!play || play->task!=Fs || play->stage!=TM_PLAY_LEVEL ||
	!play->game->commercial) throw('Owner');
  PlayEnter(play);
  try {
    GameLoad(play->game,1,map_num); PlaySndBind(play);
    play->game->level->world->exit_rqst=TM_EXIT_NORMAL;
    PlayFinish(play);
    play->result.phase=TM_IM_DONE;
    PlayNext(play,0);
  } catch {
    PlayLeave(play);
  }
  PlayLeave(play);
}

TmFinaleOwner(6);
