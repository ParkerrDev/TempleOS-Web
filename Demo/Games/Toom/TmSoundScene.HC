class SoundScene
{
  Audio *audio;
  Game *game;
  Level *level;
};

U0 SoundSceneInit(SoundScene *tmps,Audio *audio,Game *game)
{//Audio must end before its borrowed game and immutable bank owners.
  if (!audio || !game || audio->bank->wad!=game->wad ||
	audio->bank->data!=game->data) throw('Owner');
  tmps->audio=audio; tmps->game=game; tmps->level=NULL;
}

Level *SoundSceneSync(SoundScene *tmps)
{//GameLoad publishes a new level before freeing the old one.
  Level *level=tmps->game->level;
  if (tmps->level!=level) {
    AudioStop(tmps->audio);
    tmps->level=level;
  }
  return level;
}

Bool SoundOrigin(Level *level,I64 kind,I64 origin,I64 *_x,I64 *_y)
{//Only generation handles and sector indices survive between simulation tics.
  Actor *actor;
  SectorArea *area;
  if (!level) return FALSE;
  switch (kind) {
    case 0:
      if (origin) return FALSE;
      *_x=*_y=0;
      return TRUE;
    case 1:
      if (!(actor=WorldActorGet(level->world,origin))) return FALSE;
      *_x=actor->x; *_y=actor->y;
      return TRUE;
    case 2:
      if (!(0<=origin<level->map->sector_cnt)) return FALSE;
      area=level->sectors->area+origin;
      if (!area->cnt) return FALSE;
      *_x=(area->left+area->right)/2;
      *_y=(area->bottom+area->top)/2;
      return TRUE;
  }
  return FALSE;
}

Bool SoundSceneAudible(Level *level,I64 kind,I64 origin)
{
  I64 x,y;
  Actor *listener;
  if (!SoundOrigin(level,kind,origin,&x,&y)) return FALSE;
  if (!kind || kind==1 && origin==level->world->player) return TRUE;
  if (!(listener=WorldActorGet(level->world,level->world->player)))
    return FALSE;
  return AudioAudible(listener->x,listener->y,x,y,level->map_num);
}

I64 SoundSceneStart(SoundScene *tmps,I64 kind,I64 origin,I64 sound)
{
  Level *level=SoundSceneSync(tmps);
  if (!SoundSceneAudible(level,kind,origin)) return -1;
  return AudioStart(tmps->audio,kind,origin,sound);
}

U0 SoundSceneUpdate(SoundScene *tmps)
{//Removed actors and newly distant sources cannot retain the speaker.
  Level *level=SoundSceneSync(tmps);
  Audio *audio=tmps->audio;
  Channel *tmpc;
  I64 i;
  AudioUpdate(audio);
  for (i=0;i<TM_CHANNEL_NUM;i++) {
    tmpc=audio->channel+i;
    if (tmpc->sound && !SoundSceneAudible(level,tmpc->kind,tmpc->origin))
      AudioChannelDel(audio,i);
  }
}
