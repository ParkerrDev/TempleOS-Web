I64 tm_play_cases=0,tm_play_done=0,tm_play_hash=0;

I64 TmPlayHash(CDC *dc)
{
  I64 i,res=2166136261;
  for (i=0;i<dc->width_internal*dc->height;i++)
    res=(res^dc->body[i])*16777619&0xFFFFFFFF;
  return res;
}

U0 TmPlayTest()
{
  I64 used=Fs->data_heap->used_u8s,keys,clock,tic,frames,hash,i,x,y,name;
  Play *play=PlayNew("C:/ORACLE/FREEDOOM.WAD","C:/ORACLE/TMDATA.BIN");
  CDC *front=play->front,*back=play->back,*dst=DCNew(652,412);
  Level *level=play->game->level;
  Player player;
  Bool caught;
  if (!front || !back || front==back || front->width!=640 ||
	front->height!=400 || play->frames!=1 || play->flags)
    throw('Buffers');
  tm_play_cases++;
  keys=1<<TMf_KEY_UP;
  PlayTick(play,keys,TRUE);
  if (level->player.forward || play->blocked!=keys ||
	level->world->tic!=1 || play->game->clock!=1) throw('Focus');
  tm_play_cases++;
  PlayTick(play,0,TRUE); PlayTick(play,keys,TRUE);
  if (level->player.forward!=25 || play->blocked || level->world->tic!=3)
    throw('Press');
  tm_play_cases++;
  MemCpy(&player,&level->player,sizeof(Player));
  PlayTick(play,keys,FALSE);
  if (level->world->tic!=3 || play->game->clock!=4 || play->focused ||
	MemCmp(&player,&level->player,sizeof(Player))) throw('Blur');
  tm_play_cases++;
  PlayTick(play,keys,TRUE);
  if (level->world->tic!=4 || level->player.forward || play->blocked!=keys)
    throw('Held');
  tm_play_cases++;
  PlayTick(play,0,TRUE); PlayTick(play,keys,TRUE);
  if (level->player.forward!=25 || play->blocked) throw('Resume');
  tm_play_cases++;
  clock=play->game->clock; tic=level->world->tic;
  MemCpy(&player,&level->player,sizeof(Player)); play->paused=TRUE;
  PlayTick(play,1<<TMf_KEY_FIRE,TRUE);
  if (play->game->clock!=clock+1 || level->world->tic!=tic ||
	MemCmp(&player,&level->player,sizeof(Player))) throw('Pause');
  tm_play_cases++;
  play->paused=FALSE; PlayFrame(play);
  if (play->front!=back || play->back!=front || play->frames!=2 || play->flags)
    throw('Swap');
  tm_play_cases++;
  MemSet(dst->body,0xEE,dst->width_internal*dst->height);
  PlayBlot(play,dst,3,5);
  for (y=0;y<dst->height;y++) for (x=0;x<dst->width_internal;x++) {
    i=0xEE;
    if (3<=x<643 && 5<=y<405)
      i=play->front->body[x-3+(y-5)*play->front->width_internal];
    if (dst->body[x+y*dst->width_internal]!=i) throw('Blot');
  }
  if (play->flags) throw('Lock');
  tm_play_cases++;
  front=play->front; hash=TmPlayHash(front); frames=play->frames;
  name=level->map->sector[0].floor_name(I64); caught=FALSE;
  level->map->sector[0].floor_name(I64)='MISSING';
  try {
    PlayFrame(play);
  } catch {
    if (Fs->except_ch=='Flat') caught=Fs->catch_except=TRUE;
  }
  level->map->sector[0].floor_name(I64)=name;
  if (!caught || play->front!=front || play->frames!=frames ||
	play->flags || play->game->flags || TmPlayHash(front)!=hash)
    throw('Publish');
  PlayFrame(play); tm_play_cases++;
  for (i=0;i<3;i++) {
    caught=FALSE; PlayEnter(play);
    try {
      if (!i) PlayFrame(play);
      else if (i==1) PlayTick(play,0,TRUE);
      else PlayDel(play);
    } catch {
      if (Fs->except_ch=='Busy') caught=Fs->catch_except=TRUE;
    }
    if (!caught || !Bt(&play->flags,TMf_PLAY_BUSY)) throw('Busy');
    PlayLeave(play); tm_play_cases++;
  }
  caught=FALSE; play->task=Fs;
  try {
    PlayDel(play);
  } catch {
    if (Fs->except_ch=='Active') caught=Fs->catch_except=TRUE;
  }
  play->task=NULL;
  if (!caught || play->flags || play->game->flags) throw('Active');
  tm_play_cases++;
  level->player.dead=TRUE; level->player.health=0;
  clock=play->game->clock;
  PlayTick(play,1<<TMf_KEY_USE,TRUE);
  if (play->game->level==level || play->game->clock!=clock+1 ||
	play->game->level->player.health!=100 ||
	play->game->level->player.ammo[TM_AM_CLIP]!=50 ||
	play->blocked!=1<<TMf_KEY_USE) throw('Reborn');
  PlayFrame(play); hash=TmPlayHash(play->front);
  tm_play_cases++;
  clock=100; tic=play->game->clock;
  if (PlayStep(play,&clock,110,0,TRUE)!=4 || clock!=104 ||
	PlayStep(play,&clock,110,0,TRUE)!=4 || clock!=108 ||
	PlayStep(play,&clock,110,0,TRUE)!=2 || clock!=110 ||
	PlayStep(play,&clock,110,0,TRUE) || play->game->clock!=tic+10)
    throw('Clock');
  tm_play_cases++;
  if (!PlayKey(play,'p',0x19) || !play->paused ||
	PlayKey(play,'p',0x19) || !play->paused ||
	PlayKey(play,'p',0x19|SCF_NEW_KEY) || !play->paused ||
	PlayKey(play,'p',0x19|SCF_KEY_UP) || !play->paused ||
	!PlayKey(play,'P',0x19) || play->paused ||
	PlayKey(play,CH_ESC,SC_ESC|SCF_KEY_UP) || play->quit)
    throw('PauseKey');
  tm_play_cases++;
  if (!PlayKey(play,CH_ESC,SC_ESC) || !play->quit) throw('Esc');
  play->quit=FALSE;
  if (!PlayKey(play,CH_SHIFT_ESC,SC_ESC|SCF_SHIFT) || !play->quit)
    throw('ShiftEsc');
  tm_play_cases++;
  tm_play_hash=hash;
  PlayDel(play); DCDel(dst);
  if (Fs->data_heap->used_u8s!=used) throw('Cleanup');
  tm_play_done=1;
  "PLAY %d CASES HASH %d BAD 0\n",tm_play_cases,hash;
}

TmPlayTest;
