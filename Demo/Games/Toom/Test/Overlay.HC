I64 tm_overlay_cases=0,tm_overlay_done=0;

U0 TmOverlayTest()
{
  I64 *rows=FileRead("C:/ORACLE/OVERLAY.BIN"),*row,n,i,j,k,hash,
	idx[2],codes[2],used=Fs->data_heap->used_u8s;
  Game *game=GameNew("C:/ORACLE/FREEDOOM.WAD","C:/ORACLE/TMDATA.BIN");
  Level *level;
  View *view;
  State *state;
  Actor *actor;
  Player player;
  U8 *old_pix,*guard;
  if (!rows) throw('Files');
  GameLoad(game); level=game->level; view=level->view;
  actor=WorldActorGet(level->world,level->world->player);
  old_pix=view->pix; guard=MAlloc(320*168+32); view->pix=guard+16;
  MemSet(guard,0xA5,320*168+32);
  MemSet(view->depth,0x55,320*168*sizeof(I32));
  n=*rows; row=rows+1;
  for (i=0;i<n;i++,row+=14) {
    level->player.psprite[0].state=row[0];
    level->player.psprite[1].state=row[1];
    for (j=0;j<2;j++) {
      level->player.psprite[j].x=row[2]; level->player.psprite[j].y=row[3];
      if (row[j]) {
	state=game->data->state+row[j];
	idx[j]=(state->sprite*TM_SPRITE_FRAMES+state->frame&0x7FFF)*8;
	codes[j]=game->sprites->frame[idx[j]];
	if (AbsI64(codes[j])!=row[10+j]) throw('Frame');
	game->sprites->frame[idx[j]]=row[10+j];
	if (row[9]) game->sprites->frame[idx[j]]=-row[10+j];
      }
    }
    level->map->sector[actor->sector].light=row[4];
    level->player.extra_light=row[5]; level->player.fixed_colormap=row[6];
    level->player.power[TM_PW_INVISIBILITY]=row[7]; view->fuzz=row[8];
    for (k=0;k<320*168;k++) view->pix[k]=k*37+k/320*11;
    MemCpy(&player,&level->player,sizeof(Player));
    PlayerSprites(level,game->sprites);
    if (MemCmp(&player,&level->player,sizeof(Player))) throw('Mutated');
    for (j=1;j>=0;j--)
      if (row[j]) game->sprites->frame[idx[j]]=codes[j];
    hash=2166136261;
    for (k=0;k<320*168;k++) hash=(hash^view->pix[k])*16777619&0xFFFFFFFF;
    if (hash!=row[12] || view->fuzz!=row[13]) {
      "OVERLAY %d STATE %d/%d PIX %d/%d FUZZ %d/%d\n",i,row[0],row[1],
	    hash,row[12],view->fuzz,row[13];
      throw('Overlay');
    }
    tm_overlay_cases++;
  }
  for (k=0;k<16;k++)
    if (guard[k]!=0xA5 || guard[320*168+16+k]!=0xA5) throw('Guard');
  for (k=0;k<320*168;k++)
    if (view->depth[k]!=0x55555555) throw('Depth');
  view->pix=old_pix; Free(guard); GameDel(game);
  if (Fs->data_heap->used_u8s!=used) throw('Cleanup');
  Free(rows); tm_overlay_done=1;
  "OVERLAY %d CASES BAD 0\n",tm_overlay_cases;
}

TmOverlayTest;
