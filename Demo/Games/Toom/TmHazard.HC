U0 PlayerSector(Motion *tmpm,Actor *tmpa)
{//Ground contact precedes damage cadence; protective boots consume their RNG.
  World *world=tmpm->world;
  Player *player=MotionPlayer(tmpm,tmpa);
  Sector *sector;
  I64 special,damage=0;
  if (tmpa->world!=world) throw('World');
  if (!player || !tmpa->active) return;
  sector=world->map->sector+tmpa->sector;
  if (tmpa->z!=sector->floor) return;
  special=sector->special;
  switch (special) {
    case 5:
      if (!player->power[TM_PW_IRONFEET]) damage=10;
      break;
    case 7:
      if (!player->power[TM_PW_IRONFEET]) damage=5;
      break;
    case 4:
    case 16:
      if (!player->power[TM_PW_IRONFEET] || WorldRand(world)<5) damage=20;
      break;
    case 9:
      player->secrets++; sector->special=0;
      break;
    case 11:
      player->god_mode=FALSE; damage=20;
      break;
  }
  if (damage && !(world->tic&31)) ActorDamage(tmpm,tmpa,NULL,NULL,damage);
  if (special==11 && player->health<=10) world->exit_rqst=TM_EXIT_NORMAL;
}
