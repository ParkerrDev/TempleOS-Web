I64 tm_scene_done=0,tm_scene_origins=0,tm_scene_cases=0;

U0 TmSceneChk(Bool val)
{
  if (!val) {
    "SCENE CASE %d\n",tm_scene_cases+1;
    throw('Scene');
  }
  tm_scene_cases++;
}

U0 TmSceneTest()
{
  I64 initial=Fs->data_heap->used_u8s,size,*body,*ptr,used,i,j,n,phase,
	episode,map_num,x,y,source,id,old,random;
  Wad *wad=NULL;
  World *world;
  Motion *motion;
  Level level,*live;
  Game *game,*foreign;
  Audio *audio;
  Actor *actor,*listener;
  SoundScene scene;
  Sound *clip;
  U8 name[9];
  Bool caught,muted=Mute(FALSE);
  body=FileRead("C:/ORACLE/ORIGINS.BIN",&size); ptr=body;
  if (!body || size<8 || size&7) throw('File');
  n=*ptr++;
  MemSet(&level,0,sizeof(Level));
  for (i=0;i<n;i++) {
    phase=*ptr++; episode=*ptr++; map_num=*ptr++;
    if (!wad || phase==2 && episode==0 && map_num==1) {
      WadDel(wad);
      if (phase==1) wad=WadNew("C:/ORACLE/PHASE1.WAD");
      else wad=WadNew("C:/ORACLE/PHASE2.WAD");
      if (!wad) throw('Wad');
    }
    if (episode) StrPrint(name,"E%dM%d",episode,map_num);
    else StrPrint(name,"MAP%02d",map_num);
    used=Fs->data_heap->used_u8s;
    level.map=MapNew(wad,name);
    if (!level.map || *ptr++!=level.map->sector_cnt) throw('Map');
    level.world=WorldNew(level.map,NULL);
    motion=MotionNew(level.world);
    level.sectors=SectorsNew(motion);
    for (j=0;j<level.map->sector_cnt;j++) {
      if (!SoundOrigin(&level,2,j,&x,&y) || x!=ptr[0] || y!=ptr[1])
	throw('Origin');
      ptr+=2; tm_scene_origins++;
    }
    SectorsDel(level.sectors); MotionDel(motion);
    WorldDel(level.world); MapDel(level.map);
    if (Fs->data_heap->used_u8s!=used) throw('MapHeap');
  }
  WadDel(wad);
  if (ptr!=body+size/8) throw('Tail');
  Free(body);
  game=GameNew("C:/ORACLE/PHASE1.WAD","C:/ORACLE/TMDATA.BIN");
  audio=AudioNew(game->wad,game->data);
  MemSet(&scene,0,sizeof(SoundScene));
  SoundSceneInit(&scene,audio,game);
  TmSceneChk(SoundSceneStart(&scene,0,0,TM_SFX_PISTOL)==-1);
  GameLoad(game); live=game->level; world=live->world;
  listener=WorldActorGet(world,world->player);
  TmSceneChk(SoundSceneStart(&scene,1,listener->id,TM_SFX_PISTOL)>=0);
  TmSceneChk(scene.level==live && audio->speaker.sound);
  actor=WorldSpawn(world,TM_MT_PUFF,listener->x+100*65536,listener->y);
  id=actor->id; random=world->random;
  TmSceneChk(SoundSceneStart(&scene,1,id,TM_SFX_PISTOL)>=0);
  TmSceneChk(world->random==random);
  SoundSceneUpdate(&scene);
  TmSceneChk(audio->speaker.sound && audio->channel[audio->handle].origin==id);
  actor->x=listener->x+1201*65536;
  SoundSceneUpdate(&scene);
  TmSceneChk(!audio->speaker.sound);
  TmSceneChk(SoundSceneStart(&scene,1,id,TM_SFX_PISTOL)==-1);
  old=live->map_num; live->map_num=8;
  TmSceneChk(SoundSceneStart(&scene,1,id,TM_SFX_PISTOL)>=0);
  SoundSceneUpdate(&scene); TmSceneChk(!!audio->speaker.sound);
  live->map_num=old; SoundSceneUpdate(&scene);
  TmSceneChk(!audio->speaker.sound);
  actor->x=listener->x;
  TmSceneChk(SoundSceneStart(&scene,1,id,TM_SFX_PISTOL)>=0);
  WorldRemove(world,actor);
  actor=WorldSpawn(world,TM_MT_PUFF,listener->x,listener->y);
  TmSceneChk(actor->id!=id && actor->id.u32[0]==id.u32[0]);
  SoundSceneUpdate(&scene);
  TmSceneChk(!audio->speaker.sound);
  TmSceneChk(SoundSceneStart(&scene,1,id,TM_SFX_PISTOL)==-1);
  TmSceneChk(SoundSceneStart(&scene,1,actor->id,TM_SFX_PISTOL)>=0);
  actor->active=FALSE; SoundSceneUpdate(&scene);
  TmSceneChk(!audio->speaker.sound); WorldSweep(world);
  source=listener->sector;
  TmSceneChk(SoundOrigin(live,2,source,&x,&y));
  listener->x=x; listener->y=y;
  TmSceneChk(SoundSceneStart(&scene,2,source,TM_SFX_DOROPN)>=0);
  SoundSceneUpdate(&scene);
  TmSceneChk(audio->speaker.sound &&
	audio->channel[audio->handle].kind==2);
  TmSceneChk(SoundSceneStart(&scene,0,0,TM_SFX_PISTOL)>=0);
  clip=audio->speaker.sound;
  for (i=0;i<4;i++) {
    if (!i) source=SoundSceneStart(&scene,2,-1,TM_SFX_PISTOL);
    else if (i==1)
      source=SoundSceneStart(&scene,2,live->map->sector_cnt,TM_SFX_PISTOL);
    else if (i==2) source=SoundSceneStart(&scene,0,1,TM_SFX_PISTOL);
    else source=SoundSceneStart(&scene,3,0,TM_SFX_PISTOL);
    TmSceneChk(source==-1 && audio->speaker.sound==clip);
  }
  foreign=CAlloc(sizeof(Game)); used=Fs->data_heap->used_u8s;
  caught=FALSE;
  try {
    SoundSceneInit(&scene,audio,foreign);
  } catch {
    if (Fs->except_ch=='Owner') caught=Fs->catch_except=TRUE;
  }
  TmSceneChk(caught && scene.game==game &&
	Fs->data_heap->used_u8s==used);
  Free(foreign);
  old=world->first; actor=WorldActorGet(world,old);
  WorldActorPlace(world,actor,listener->x,listener->y,actor->z);
  TmSceneChk(SoundSceneStart(&scene,1,old,TM_SFX_PISTOL)>=0);
  GameLoad(game,1,2);
  TmSceneChk(game->level!=live);
  SoundSceneUpdate(&scene);
  TmSceneChk(scene.level==game->level && !audio->speaker.sound);
  for (i=0;i<TM_CHANNEL_NUM;i++) TmSceneChk(!audio->channel[i].sound);
  world=game->level->world;
  actor=WorldActorGet(world,old);
  TmSceneChk(!!actor);
  listener=WorldActorGet(world,world->player);
  WorldActorPlace(world,actor,listener->x,listener->y,actor->z);
  TmSceneChk(SoundSceneStart(&scene,1,old,TM_SFX_PISTOL)>=0);
  AudioDel(audio); GameDel(game); Mute(muted);
  if (Fs->data_heap->used_u8s!=initial || tm_speaker_port&3)
    throw('Cleanup');
  tm_scene_done=1;
  "SOUND SCENE %d ORIGINS %d CASES BAD 0\n",
	tm_scene_origins,tm_scene_cases;
}

TmSceneTest;
