I64 tm_setup_cases=0,tm_setup_done=0;

U0 TmSetupTest()
{
  I64 i,j,k,n,*rows=FileRead("C:/ORACLE/SETUP.BIN"),*row,out[55],
	used,ready;
  U8 *expected,name[32];
  Game *game=GameNew("C:/ORACLE/FREEDOOM.WAD","C:/ORACLE/TMDATA.BIN"),*fast;
  Player *player;
  Actor *actor;
  if (!rows) throw('Files');
  for (i=0;i<3;i++) {
    StrPrint(name,"C:/ORACLE/FAST%d.BIN",i); expected=FileRead(name);
    if (!expected) throw('Expected');
    fast=game;
    if (i==1) fast=GameNew("C:/ORACLE/FREEDOOM.WAD",
	  "C:/ORACLE/TMDATA.BIN",4);
    else if (i==2) fast=GameNew("C:/ORACLE/FREEDOOM.WAD",
	  "C:/ORACLE/TMDATA.BIN",2,TRUE);
    if (MemCmp(expected,fast->data->body,TM_DATA_SIZE)) throw('Fast');
    if (i) {
      if (fast->data->body==game->data->body) throw('Shared');
      GameDel(fast);
    }
    Free(expected); tm_setup_cases++;
  }
  expected=FileRead("C:/ORACLE/FAST0.BIN");
  if (!expected || MemCmp(expected,game->data->body,TM_DATA_SIZE))
    throw('Mutated');
  Free(expected);
  GameLoad(game); game->clock=500;
  used=Fs->data_heap->used_u8s;
  n=*rows; row=rows+1;
  for (i=0;i<n;i++,row+=60) {
    player=&game->level->player;
    MemSet(player,0,sizeof(Player));
    player->health=row[1]; player->armor=row[2]; player->armor_type=1;
    player->backpack=TRUE; ready=player->ready_weapon=row[4];
    player->pending_weapon=TM_WP_NOCHANGE;
    player->weapon[TM_WP_FIST]=player->weapon[TM_WP_PISTOL]=TRUE;
    player->weapon[ready]=TRUE;
    player->ammo[0]=row[3];
    for (j=1;j<4;j++) player->ammo[j]=10+j;
    for (j=0;j<4;j++) player->max_ammo[j]=tm_ammo_max[j]*2;
    for (j=0;j<6;j++) {player->card[j]=TRUE; player->power[j]=j+1;}
    player->damage_cnt=player->bonus_cnt=player->refire=55;
    player->extra_light=player->fixed_colormap=55;
    player->psprite[0].state=100; player->psprite[0].tics=44;
    player->psprite[0].x=123456; player->psprite[0].y=654321;
    player->psprite[1].state=200; player->psprite[1].tics=55;
    player->psprite[1].x=-222222; player->psprite[1].y=333333;
    player->dead=row[0]==1;
    actor=WorldActorGet(game->level->world,game->level->world->player);
    actor->health=player->health;
    GameLoad(game,1,1,row[0]==2); player=&game->level->player;
    k=0;
    out[k++]=player->health; out[k++]=player->armor;
    out[k++]=player->armor_type; out[k++]=player->ready_weapon;
    out[k++]=player->pending_weapon; out[k++]=player->use_down;
    out[k++]=player->attack_down; out[k++]=player->kills;
    out[k++]=player->items; out[k++]=player->secrets;
    out[k++]=player->damage_cnt; out[k++]=player->bonus_cnt;
    out[k++]=player->extra_light; out[k++]=player->fixed_colormap;
    out[k++]=player->view_height; out[k++]=player->view_z;
    out[k++]=player->refire; out[k++]=player->backpack;
    for (j=0;j<9;j++) out[k++]=player->weapon[j];
    for (j=0;j<4;j++) out[k++]=player->ammo[j];
    for (j=0;j<4;j++) out[k++]=player->max_ammo[j];
    for (j=0;j<6;j++) out[k++]=player->card[j];
    for (j=0;j<6;j++) out[k++]=player->power[j];
    for (j=0;j<2;j++) {
      out[k++]=player->psprite[j].state; out[k++]=player->psprite[j].tics;
      out[k++]=player->psprite[j].x; out[k++]=player->psprite[j].y;
    }
    if (k!=55) throw('Fields');
    for (j=0;j<55;j++)
      if (out[j]!=row[5+j]) {
	"SETUP %d FIELD %d GOT %d EXPECT %d\n",i,j,out[j],row[5+j];
	throw('Setup');
      }
    if (game->clock!=500 || game->level->world->tic || game->flags ||
	  Fs->data_heap->used_u8s!=used) throw('Cleanup');
    tm_setup_cases++;
  }
  GameDel(game); Free(rows); tm_setup_done=1;
  "SETUP %d CASES BAD 0\n",tm_setup_cases;
}

TmSetupTest;
