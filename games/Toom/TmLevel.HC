#define TMf_GAME_BUSY 0

extern class Game;

class Level
{
  Game *game;
  Map *map;
  World *world;
  Motion *motion;
  Sectors *sectors;
  Specials *specials;
  Enemies *enemies;
  Brain *brain;
  Actions *actions;
  Weapon *weapon;
  Surfaces *surfaces;
  View *view;
  Player player;
  I64 episode,map_num;
};

class Game
{
  Wad *wad;
  GameData *data;
  Graphics *graphics;
  Sprites *sprites;
  Level *level;
  I64 flags,clock,skill;
  Bool commercial,fast;
};

U0 GameEnter(Game *tmpg)
{//One owner may load, advance or draw this session at a time.
  if (LBts(&tmpg->flags,TMf_GAME_BUSY)) throw('Busy');
}

U0 GameLeave(Game *tmpg)
{
  LBtr(&tmpg->flags,TMf_GAME_BUSY);
}

Specials *LevelSpecials(Actor *actor)
{
  Actions *actions=actor->world->actions;
  Specials *res;
  if (!actions) throw('Actions');
  res=actions->brain->enemies->specials;
  if (res->sectors->motion->world!=actor->world) throw('World');
  return res;
}

U0 LevelTouch(Actor *mover,Actor *other,I64 kind)
{
  MotionTouch(LevelSpecials(mover)->sectors->motion,mover,other,kind);
}

U0 LevelCross(Actor *actor,I64 line,I64 side)
{
  LineCross(LevelSpecials(actor),actor,line,side);
}

U0 LevelShoot(Actor *actor,I64 line,U8 *context)
{
  if (LevelSpecials(actor)!=context) throw('Owner');
  LineShoot(context,actor,line);
}

U0 LevelNoise(Actor *actor)
{
  LevelSpecials(actor);
  EnemyNoise(actor->world->actions->brain->enemies,actor,actor);
}

U0 LevelDel(Level *tmpl)
{//An unpublished candidate borrows Game until its final child is gone.
  if (tmpl) {
    if (tmpl->game->level==tmpl) throw('Active');
    if (tmpl->world) WorldIdle(tmpl->world);
    ViewDel(tmpl->view); ActionsDel(tmpl->actions);
    WeaponDel(tmpl->weapon); BrainDel(tmpl->brain);
    EnemiesDel(tmpl->enemies); SpecialsDel(tmpl->specials);
    SectorsDel(tmpl->sectors); MotionDel(tmpl->motion);
    WorldDel(tmpl->world); SurfacesDel(tmpl->surfaces);
    MapDel(tmpl->map); Free(tmpl);
  }
}

Level *LevelNew(Game *tmpg,I64 episode,I64 map_num,Bool reborn=FALSE)
{//Keep inventory, random position and brain phase private until publication.
  Level *old=tmpg->level,*tmpl;
  Actor *actor;
  U8 name[9];
  Bool easy=FALSE;
  if (tmpg->clock<0) throw('Clock');
  if (tmpg->commercial) {
    if (!(1<=map_num<=32)) throw('Map');
  } else if (!(1<=episode<=4) || !(1<=map_num<=9)) throw('Map');
  if (old) WorldIdle(old->world);
  tmpl=CAlloc(sizeof(Level)); tmpl->game=tmpg;
  tmpl->episode=episode; tmpl->map_num=map_num;
  try {
    if (tmpg->commercial) StrPrint(name,"MAP%02d",map_num);
    else StrPrint(name,"E%dM%d",episode,map_num);
    if (!(tmpl->map=MapNew(tmpg->wad,name))) throw('Map');
    tmpl->world=WorldNew(tmpl->map,tmpg->data,tmpg->skill);
    tmpl->world->fast=tmpg->fast;
    if (old) {
      MemCpy(&tmpl->player,&old->player,sizeof(Player));
      tmpl->world->random=old->world->random; easy=old->brain->easy;
    }
    tmpl->player.kills=tmpl->player.items=tmpl->player.secrets=0;
    tmpl->player.view_z=1;
    if (!old || reborn || tmpl->player.dead || tmpl->player.reborn) {
      PlayerBorn(&tmpl->player);
      tmpl->player.use_down=tmpl->player.attack_down=TRUE;
    }
    MemSet(tmpl->player.power,0,TM_POWER_NUM*sizeof(I64));
    MemSet(tmpl->player.card,0,TM_CARD_NUM*sizeof(Bool));
    tmpl->player.dead=tmpl->player.reborn=FALSE;
    tmpl->player.refire=tmpl->player.damage_cnt=tmpl->player.bonus_cnt=0;
    tmpl->player.extra_light=tmpl->player.fixed_colormap=0;
    tmpl->player.attacker=tmpl->player.pickup_tics=0;
    tmpl->player.view_height=TM_EYE_HEIGHT;
    PlayerCmd(&tmpl->player,0,0,0,0);
    WorldLoadThings(tmpl->world);
    actor=WorldActorGet(tmpl->world,tmpl->world->player);
    if (!actor || actor->type!=TM_MT_PLAYER) throw('Player');
    actor->health=tmpl->player.health;
    tmpl->motion=MotionNew(tmpl->world,&tmpl->player);
    tmpl->sectors=SectorsNew(tmpl->motion,tmpg->graphics);
    tmpl->specials=SpecialsNew(tmpl->sectors);
    tmpl->specials->monsters_stomp=tmpg->commercial && map_num==30;
    tmpl->enemies=EnemiesNew(tmpl->specials);
    if (!tmpl->enemies) throw('Sectors');
    tmpl->brain=BrainNew(tmpl->enemies,easy);
    tmpl->actions=ActionsNew(tmpl->brain,&tmpg->clock,episode,map_num,
	  tmpg->commercial);
    tmpl->weapon=WeaponNew(tmpl->motion);
    tmpl->motion->touch=&LevelTouch; tmpl->motion->cross=&LevelCross;
    tmpl->weapon->special=&LevelShoot;
    tmpl->weapon->special_context=tmpl->specials;
    tmpl->weapon->noise=&LevelNoise;
    WeaponStart(tmpl->weapon); SpecialsInit(tmpl->specials);
    if (!(tmpl->surfaces=SurfacesNew(tmpl->map,tmpg->graphics)))
      throw('Surface');
    if (!(tmpl->view=ViewNew(tmpl->map,tmpg->graphics,tmpl->surfaces)))
      throw('View');
    if (old) tmpl->view->fuzz=old->view->fuzz;
    StrCpy(name,"SKY1");
    if (tmpg->commercial) {
      if (map_num>=21) name[3]='3';
      else if (map_num>=12) name[3]='2';
    } else name[3]='0'+episode;
    tmpl->view->sky=TextureFind(tmpg->graphics,name);
    if (tmpl->view->sky<0) throw('Sky');
  } catch {
    LevelDel(tmpl);
  }
  return tmpl;
}

U0 GameDel(Game *tmpg)
{
  Level *level;
  if (tmpg) {
    GameEnter(tmpg);
    try {
      level=tmpg->level;
      if (level) WorldIdle(level->world);
      tmpg->level=NULL; LevelDel(level);
      SpritesDel(tmpg->sprites); GraphicsDel(tmpg->graphics);
      GameDataDel(tmpg->data); WadDel(tmpg->wad);
    } catch {
      GameLeave(tmpg);
    }
    Free(tmpg);
  }
}

Game *GameNew(U8 *wad_name,U8 *data_name="TMDATA.BIN",I64 skill=2,
	Bool fast=FALSE)
{//Each session owns its data so fast states cannot alter another game.
  Game *tmpg;
  I64 i;
  if (!(0<=skill<=4)) throw('Skill');
  tmpg=CAlloc(sizeof(Game)); tmpg->skill=skill;
  tmpg->fast=fast || skill==4;
  try {
    if (!(tmpg->wad=WadNew(wad_name))) throw('Wad');
    if (!(tmpg->data=GameDataNew(data_name))) throw('Data');
    if (tmpg->fast) {
      for (i=TM_S_SARG_RUN1;i<=TM_S_SARG_PAIN2;i++)
	tmpg->data->state[i].tics>>=1;
      tmpg->data->info[TM_MT_BRUISERSHOT].speed=20*65536;
      tmpg->data->info[TM_MT_HEADSHOT].speed=20*65536;
      tmpg->data->info[TM_MT_TROOPSHOT].speed=20*65536;
    }
    tmpg->commercial=LumpFind(tmpg->wad,"MAP01")>=0;
    if (!tmpg->commercial && LumpFind(tmpg->wad,"E1M1")<0) throw('Game');
    if (!(tmpg->graphics=GraphicsNew(tmpg->wad))) throw('Graphics');
    if (!(tmpg->sprites=SpritesNew(tmpg->wad,tmpg->data))) throw('Sprites');
  } catch {
    GameDel(tmpg);
  }
  return tmpg;
}

U0 GameLoad(Game *tmpg,I64 episode=1,I64 map_num=1,Bool reborn=FALSE)
{//The active level is replaced only after the complete candidate exists.
  Level *next,*old;
  GameEnter(tmpg);
  try {
    old=tmpg->level;
    next=LevelNew(tmpg,episode,map_num,reborn);
    tmpg->level=next; LevelDel(old);
  } catch {
    GameLeave(tmpg);
  }
  GameLeave(tmpg);
}

I64 GameTick(Game *tmpg,I64 forward=0,I64 side=0,I64 turn=0,I64 buttons=0,
	I64 weapon=TM_WP_NOCHANGE,Bool paused=FALSE)
{//The session clock survives levels and advances even while gameplay pauses.
  Level *level;
  I64 res;
  GameEnter(tmpg);
  try {
    level=tmpg->level;
    if (!level) throw('Level');
    if (tmpg->clock<0 || tmpg->clock==I64_MAX) throw('Clock');
    if (!paused) PlayerCmd(&level->player,forward,side,turn,buttons,weapon);
    res=LevelTick(level->weapon,level->specials,level->surfaces,paused);
    tmpg->clock++;
  } catch {
    GameLeave(tmpg);
  }
  GameLeave(tmpg);
  return res;
}
