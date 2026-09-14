U0 Stage0(Actor *p)
{
 switch(mc->combatMenuSelection){

  case CMS_MOVE_DONE:
   mc->turnIndex++;

   if(mc->turnIndex > 1){
    EndCombatTurn(0, p);
   }
  break;


  case CMS_STRIKE_DONE:
   mc->turnIndex++;

   if(mc->turnIndex > 3){
    I64 damage = p->str;

    RemoveHealth(p->target, damage);
    SetActorDir(p, DELIMITER);

    EndCombatTurn(0, p);
   }
  break;


  case CMS_PRAYER_DONE:

   if(mc->isItem)
    UseItemCombat(p);
   else
    UsePrayerCombat(p);

   mc->turnIndex++;

   if(mc->turnIndex > 3){
    EndCombatTurn(0, p);
   }

  break;


  case CS_FLEE:
   mc->turnIndex++;

   if(mc->turnIndex > 3){

    mc->turnIndex = 0;

    Actor *player = GetPlayer();

    if(PlayerInAggroRange(player)){
     EndCombatTurn(0, p);
     break;
    }

    U16 r = RandU16();

    if(r < 0.8 * 65536){
     CombatQueFree();
     mc->combatON = FALSE;
     mc->combatMenuStage = STAGE_0;

    } else {
     EndCombatTurn(0, p);
    }
   }

  break;
 }
}

//I64 i = iterable
//Actor p = local player
U0 Stage1(I64 i, Actor *p)
{
 /*
  Stage1 should never automatically execute
  the local player's turn.
 */
 if(ctp->ready->id == mc->localPlayerId){
  mc->combatMenuStage = STAGE_0;
  mc->combatMenuSelection = CMS_MOVE;
  mc->turnIndex = 0;

  return;
 }

 switch(mc->combatMenuSelection){
  case CMS_ENE1:
   mc->turnIndex++;
   if(ctp->ready->status1 != DEAD_STATUS && ctp->ready->status1!=DYNG_STATUS){
    ctp->ready->target = p;
    if(!HasDirective(ARCSTRIKE, ctp->ready)){
     AddDirective(ARCSTRIKE, ctp->ready);
     AddStatus(ctp->ready, ATTK_STATUS);
    }
   }
   if(mc->turnIndex >= 6){
    AdvanceEnemyTurn();
   }
  break;
  case CMS_ENE2:
   if(mc->turnIndex==1)
   {
    RemoveHealth(ctp->ready->target,ctp->ready->str);
   UpdateDirective(
    ARCSTRIKE,
    ctp->ready,
    0, 0, 0,
    TRUE
   );
   }
   mc->turnIndex++;
   if(mc->turnIndex >= 6){
    EndCombatTurn(i, p);
   }

  break;
 }
}


I64 BuildEncounter(Actor *trigger, Actor **encounter){
 I64 count = 0;
 Actor *enemy = actors->next;

 while(enemy != actors)
 {
  if(enemy == GetPlayer())
   goto nextEnemy;

  if(enemy->status1 == DEAD_STATUS ||enemy->status1==DYNG_STATUS)
   goto nextEnemy;

  if(enemy->ai_script != AI_DEFAULT)
   goto nextEnemy;

  if(Abs(enemy->x - trigger->x) <= AGGRO_DIS &&
     Abs(enemy->y - trigger->y) <= AGGRO_DIS){
   encounter[count++] = enemy;
   if(count >= MAX_ENCOUNTER)
    break;
  }

nextEnemy:
  enemy = enemy->next;
 }

 return count;
}

U0 TickTile(I64 i, I64 j, Actor *p)
{
 if(camera->topLR+i >= wY || camera->topLR+i < 0)
  return;

 I64 npc = GetTensorNPC(
  world->level,
  camera->topLR+i,
  camera->topUD+j,
  world->currentZ
 );

 if(npc == IT_NULL)
  return;

 if(npc == mc->localPlayerId)
  return;

 Actor *trigger = GetNPC(npc);

 if(mc->combatON)
  return;

 if(trigger->ai_script != AI_DEFAULT)
  return;

 if(trigger->status1 == DEAD_STATUS||trigger->status1==DYNG_STATUS)
  return;

 if(Abs(p->x - trigger->x) > AGGRO_DIS)
  return;

 if(Abs(p->y - trigger->y) > AGGRO_DIS)
  return;

 Actor *encounter[MAX_ENCOUNTER];
 I64 count = BuildEncounter(trigger, encounter);

 if(count > 0)
  CombatQueInit(encounter, count);
}

U0 TickCombat(I64 i,I64 j,Actor *p)
{
 //Tick Combat
 switch(mc->combatMenuStage){
  case STAGE_0: Stage0(p); break;
  case STAGE_1: Stage1(i, p);break;
 }

}

U0 TickInteract(I64 i, I64 j, Actor *p){

 if(mc->lootedSwitch){
  mc->displayInventory=TRUE;
 }
}

Bool ActorIsStillMovingOrScrolling(Actor *p)
{
  if(p->walking != DIR_IDLE)
    return TRUE;
  if(camera->cameraOffSetX != 0)
    return TRUE;
  if(camera->cameraOffSetY != 0)
    return TRUE;
  return FALSE;
}

U0 FinishActorPath(Actor *p)
{
  if(p->pickUpTrigger){
  
    MapNode *pin = GetTensorNode(world->level,
                                 p->x, p->y, world->currentZ);
    PickUpItemTrigger(p, pin);
    p->pickUpTrigger = FALSE;
  }

  ClearActorPath(p);
}

U0 UpdateActorPath(Actor *p)
{
  MapNode *pin;
  if(!p->hasPath)
    return;
  if(p->pathIndex >= p->pathLen) {
    FinishActorPath(p);
    return;
  }
  if(ActorIsStillMovingOrScrolling(p))
    return;

  if(mc->combatON) {
    if(mc->combatMenuSelection != CS_MOVE) {
      ClearActorPath(p);
      return;
    }

    if(p->currentMana < MOVEMENT_COST) {
      mc->combatMenuSelection = CMS_MOVE_DONE;
      ClearActorPath(p);
      return;
    }

    if(MoveActor(p, p->pathDirs[p->pathIndex]))
     p->pathIndex++;
    RemoveMana(p, MOVEMENT_COST);

    //ClearActorPath(p);   // one tile only in combat
    return;
  }

  if(MoveActor(p, p->pathDirs[p->pathIndex]))
   p->pathIndex++;
  if(p->pathIndex >= p->pathLen) {
    FinishActorPath(p);
    return;
  }
}

U0 TickActorWalkState(Actor *a)
{
  if(a->walking == DIR_IDLE)
    return;

  WalkMap *m = &walkMapEntry[a->walking];
  SetActorSubFrameRule(a, m->wsf, m->wf);
}
Bool IsSpawnable(I64 x,I64 y)
{
 if(CheckSolid(world->level,x,y,world->currentZ))
  return FALSE;

 if(GetTensorNPC(world->level,x,y,world->currentZ)!=IT_NULL)
  return FALSE;

 return TRUE;
}


U0 FindFreeSpawnTile(I64 *outX,I64 *outY)
{
 Actor *host = GetPlayer();

 I64 dx,dy;
 I64 x,y;

 for(dy=-2;dy<=2;dy++)
 {
  for(dx=-2;dx<=2;dx++)
  {
   x = host->x + dx;
   y = host->y + dy;

   if(IsSpawnable(x,y))
   {
    *outX = x;
    *outY = y;
    return;
   }
  }
 }

 // fallback
 *outX = host->x;
 *outY = host->y;
}
//updates the matrix model based on taken actions
U0 WorldTick(I64 i, I64 j, Actor *p){

 if(mc->combatON)
  TickCombat(i,j,p);

 TickInteract(i,j,p);
 //Tick World
 for(j=-1;j<12;j++){
  if(camera->topUD+j<wX&&camera->topUD+j>=0){
   I64 screenY = j*camera->dividY+camera->cameraOffSetY; 
   for(i=-1;i<12;i++){
    TickTile(i,j,p);
   }
  }
 }

 mc->tickWeather++;
 if(mc->tickWeather>W_T)
  mc->tickWeather=0;
}
 

Bool IfAnyKey(){
 I64 i, keycount = sizeof(Keys) / sizeof(KeyState);
 KeyState *k = &keyboard;
 for(i=0;i<keycount; ++i) {
  if(k[i].isDown && !k[i].wasDown) {
   mc->mouseTargetingActive=FALSE;
   return TRUE; // at least one key was freshly pressed
  }
 }
 return FALSE;
}

U0 HandleKeyboard(Actor *p) {
 MapNode *puin = GetTensorNode(world->level,
                    p->x,p->y,world->currentZ);

 if(IfAnyKey)
   AnyKey;
 if(KeyPressed(&keyboard.inv)) {
  InvButton;
 }
 if(KeyPressed(&keyboard.equipment)) {
  if(mc->lootedSwitch)
   TakeAllLoot(p);
  else
   mc->displayEquipment = !mc->displayEquipment;
 }

 if(KeyPressed(&keyboard.stats)) {
  mc->displayStats = !mc->displayStats;
 }

 if(KeyPressed(&keyboard.developer)) {
  mc->displayDev = !mc->displayDev;
 }

 if(KeyPressed(&keyboard.esc)) {
        // ESC action
 }

 if(KeyPressed(&keyboard.enter)) {
  KeyEnter(p,puin);
 }
 if(KeyPressed(&keyboard.shift)) {
  KeyShift;
 }
 if(p->walking==DIR_IDLE&& p->walking!=DELIMITER&&
    camera->cameraOffSetX==0&&
    camera->cameraOffSetY==0){
  if(keyboard.up.isDown){
   KeyArrow(p,DIR_UP);
  } else if(keyboard.down.isDown){
   KeyArrow(p,DIR_DOWN);
  } else if(keyboard.left.isDown){
   KeyArrow(p,DIR_LEFT);
  } else if(keyboard.right.isDown){ 
   KeyArrow(p,DIR_RIGHT);
  }
 }
}

