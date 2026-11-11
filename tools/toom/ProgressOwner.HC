U0 TmProgressOwnerExit()
{//A queued job uses the real exit line from the game's own task.
  Play *play=Fs->user_data;
  Level *level=play->game->level;
  Actor *actor=WorldActorGet(level->world,level->world->player);
  I64 i;
  if (play->task!=Fs || play->stage!=TM_PLAY_LEVEL) throw('Owner');
  PlayEnter(play);
  try {
    for (i=0;i<level->map->line_cnt;i++)
      if (level->map->line[i].special==11) {
	if (!LineUse(level->specials,actor,i,0)) throw('Use');
	break;
      }
    if (i==level->map->line_cnt) throw('Exit');
  } catch {
    PlayLeave(play);
  }
  PlayLeave(play);
}

TmProgressOwnerExit;
