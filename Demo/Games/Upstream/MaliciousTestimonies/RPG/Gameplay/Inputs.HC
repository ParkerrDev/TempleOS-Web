
U0 KeyEnter(Actor *p, MapNode *puin)
{
 if(mc->displayDev)
 {DevKeyEnter(); }
 else if(MerchantList(mc->talkieScene)){
  switch(mc->combatMenuSelection){
   case 0://trade
   //todo show tradewindow
    mc->talkieScene = IT_NULL;
    mc->lootedSwitch = TRUE;
    mc->lootInv = GetNPC(mc->dialogID)->myInv;
    break;
   case 1://close
    mc->talkieScene = IT_NULL; 
    break;
  }
 } else if(mc->combatON){
  switch(mc->combatMenuSelection){
   case CMS_MOVE://move
    mc->combatMenuSelection =CS_MOVE; 
    break;
   case CMS_STRIKE://strike
    mc->combatMenuSelection =CS_STRIKE; 
    break;
   case CMS_PRAYER://prayer
    GatherSelections(); 
    mc->combatMenuSelection =CS_PRAYER;
    break;
   case CMS_FLEE://flee
    mc->combatMenuSelection =CS_FLEE; 
    break;
   case CS_MOVE://move completion
    mc->combatMenuSelection =CMS_MOVE_DONE;
    break;
   case CS_STRIKE://strike completion
    mc->combatMenuSelection=CMS_STRIKE_DONE;
    PlayStrikeAnim(p);
    break;
   case CS_PRAYER://select which prayer
    if(mc->prayerToCast!=DELIMITER){
     if(mc->isItemSelector){
      mc->isItem=TRUE;
      I64 itemID = RetrieveItemID(p->myInv,mc->prayerToCast);
      RemoveItemLocID(mc->prayerToCast,TRUE);
      mc->prayerToCast = itemID; 
     }     
     mc->combatMenuSelection=CS_PRAYER2;
    }
    else{
     mc->combatMenuSelection=CMS_PRAYER;//go back
     mc->prayerListIndex = 0;
    }
   break;
   case CS_PRAYER2://select target (prayer completion)
    mc->combatMenuSelection=CMS_PRAYER_DONE;
    break;

  }//end switch
 }else{
  if(mc->displaySave)
  { mc->currentMenu=0;
    mc->currentSong=1;
    SaveFormReturn(p); 
  }
  if(puin->hasObj)
   ObjectTrigger(p,puin);
  PickUpItemTrigger(p,puin);
 }
}

U0 KeyArrow(Actor *p, I64 dir){
 //corresponds to DIR left, right, up, down
 //cancel existing pathing.
 ClearActorPath(p);
 SetActorDir(p,DELIMITER);//in progress

 if(mc->talkieScene==IT_NULL){
  if(mc->combatON){
   CombatTurnArrows(p,dir);
  }else{
   MoveActor(p,dir);
  }
 } else if(MerchantList(mc->talkieScene)){
  switch(mc->combatMenuSelection){
   case CMS_MOVE:
    if(KeyPressed(&keyboard.up)){mc->combatMenuSelection=CMS_STRIKE;}
    else if(KeyPressed(&keyboard.down)){mc->combatMenuSelection++;}
  break;
  case CMS_STRIKE:
   if(KeyPressed(&keyboard.down)){
    mc->combatMenuSelection=CMS_MOVE;
   }
   else if(KeyPressed(&keyboard.up)){mc->combatMenuSelection--;}
  break;
  }
 }else{
  MoveActor(p,dir);
 }
} 


U0 KeyEsc()
{

}

U0 KeyShift(){
 mc->running = !mc->running;
}

U0 AdvanceEnemyTurn(){
 Actor *player = GetPlayer();
 switch(mc->combatMenuSelection){
  case CMS_ENE1:
   mc->combatMenuSelection = CMS_ENE2;
   if(HasStatus(ctp->ready, ATTK_STATUS) &&
      ctp->ready->id != mc->localPlayerId){
    mc->turnIndex = 0;
   }
  break;
  case CMS_ENE2:
   mc->combatMenuSelection = CMS_ENE1;
   mc->turnIndex = 0;
  break;
  default:
   mc->combatMenuSelection = CMS_ENE1;
  break;
 }
}

U0 AnyKey(){
 if(mc->dialogSelection)
  mc->dialogSelection=0;
 else
  mc->dialogSelection=1;
 return; //skip
 if(mc->combatMenuStage != STAGE_1)
  return;

 switch(mc->combatMenuSelection)
 {
  case CMS_ENE1:
   if(mc->turnIndex > 2)
    AdvanceEnemyTurn(); 
  break;

  case CMS_ENE2:
   if(mc->turnIndex > 2)
    AdvanceEnemyTurn();
  break;

  default:
   AdvanceEnemyTurn();
  break;
 }
}

U0 AutoTurnEnd()
{
 if(mc->combatMenuStage == STAGE_1)
  AdvanceEnemyTurn();
}

Bool CombatDialog2Hover(I64 M_X, I64 M_Y)
{
 if(!mc->combatON|| (
     mc->combatMenuSelection<CMS_MOVE||mc->combatMenuSelection>CMS_FLEE))
  return FALSE;

 if(InRect(M_X, M_Y, 0, 383, 218, 432)){
  mc->combatMenuSelection = CMS_MOVE;
  return TRUE;
 }
 if(InRect(M_X, M_Y, 218, 383, 471, 432)){
  mc->combatMenuSelection = CMS_STRIKE;
  return TRUE;
 }
 if(InRect(M_X, M_Y, 0, 432, 218, 480)){
  mc->combatMenuSelection = CMS_PRAYER;
  return TRUE;
 }
 if(InRect(M_X, M_Y, 218, 432, 471, 480)){
  mc->combatMenuSelection = CMS_FLEE;
  return TRUE;
 }

 return FALSE;
}

Bool CombatDialog2Click(I64 M_X, I64 M_Y)
{
 if(mc->combatON&&(mc->combatMenuSelection>=CMS_MOVE&&
    mc->combatMenuSelection<=CMS_FLEE)){
 switch(mc->combatMenuSelection){
  case CMS_MOVE:
   mc->combatMenuSelection = CS_MOVE;
   return TRUE;

  case CMS_STRIKE:
   mc->combatMenuSelection = CS_STRIKE;
   return TRUE;

  case CMS_PRAYER:
   GatherSelections();
   mc->combatMenuSelection = CS_PRAYER;
   return TRUE;

  case CMS_FLEE:
   mc->combatMenuSelection = CS_FLEE;
   return TRUE;
 }
 }
 return FALSE;
}
Bool NoGameWindowOpen(I64 M_X, I64 M_Y)
{
 if(!mc->displayInventory&&!mc->displayEquipment&&!mc->lootedSwitch       &&
        !mc->draggingInv&&!mc->prayerDragging)
 {
  return TRUE;
 }
 if(mc->displayInventory&& InRect(M_X,M_Y,0,0,480,270))
  return TRUE;
 if(mc->displayEquipment && InRect(M_X,M_Y,220,0,480,480))
  return TRUE; 
 if(mc->displayEquipment&&mc->displayInventory && 
    InRect(M_X,M_Y,220,0,480,270))
  return TRUE;

 return FALSE;
}

U0 HandleMouseAction(I64 id, I64 M_X, I64 M_Y, I64 i, I64 j){
 switch(id){
  case BTN_EQUIP:
   if(mc->displayStats == FALSE)
    EquipButton;
  break;

  case BTN_STATS:
   if(mc->displayStats == FALSE)
    mc->displayStats = TRUE;
  break;

  case BTN_INV:
   if(mc->displayStats == FALSE)
    InvButton;
  break;

  case BTN_RUN:
   KeyShift;
  break;

  case BTN_ORB:
   WorldButton;
  break;

  case BTN_PRAYER:
   if(mc->displayPrayers == FALSE)
    PrayerButton;
  break;

  case BTN_MUSIC:
   if(mc->displayStats == FALSE)
    MusicButton;
  break;

  case BTN_FX:
   if(mc->displayStats == FALSE)
    FxButton;
  break;

  case BTN_EQUIP_X:
   if(mc->displayEquipment == TRUE)
    mc->displayEquipment = FALSE;
  break;

  case BTN_INV_X:
   if(mc->displayInventory == TRUE){
    mc->displayInventory = FALSE;
    mc->lootedSwitch = FALSE;
   }
  break;

  case BTN_SUBMENU_X:
   if(mc->displayPrayers == TRUE || mc->displayStats == TRUE){
    mc->displayStats = FALSE;
    mc->displayPrayers = FALSE;
   }
  break;

  case BTN_SAVE:
   SaveButton;
  break;
 }
}

U0 HandleMouseSideBar(I64 M_X, I64 M_Y, I64 i, I64 j){
 Bool subMenu = mc->displayPrayers || mc->displayStats;
 if(subMenu){
  if(mc->displayPrayers){
   PrayerFilters(M_X, M_Y, i, j);
  }
  if(InRect(M_X, M_Y, 580, 0, 641, 40)){
   mc->displayStats = FALSE;
   mc->displayPrayers = FALSE;
  }
  if(InRect(M_X, M_Y, 496, 421, 619, 458)){
   SaveButton;
  }
  return;
 }
 I64 id = FindClickRegion(sideBarButtons,
                          CLICKREGIONS,
                          M_X, M_Y);
 if(id)
  HandleMouseAction(id, M_X, M_Y, i, j);
}
Bool HandleMouseEquipRelease(I64 M_X, I64 M_Y, I64 i, I64 j)
{
 ClickRegion regions[EQREGIONS];
 I64 id;

 if(!mc->draggingInv)
  return FALSE;

 if(mc->displayEquipment != TRUE)
  return FALSE;

 BuildEquipRegions(regions);

 id = FindClickRegion(regions, EQREGIONS, M_X, M_Y);

 switch(id){
  case EQ_SLOT_SWORD:
   ReleaseSword;
   return TRUE;

  case EQ_SLOT_HELM:
   ReleaseHelm;
   return TRUE;

  case EQ_SLOT_BODY:
   ReleaseBody;
   return TRUE;

  case EQ_SLOT_RING:
   ReleaseRing;
   return TRUE;
 }

 return FALSE;
}

Bool HandleInvGridClick(I64 M_X, I64 M_Y,
                        I64 baseX, I64 baseY,
                        Inventory *inv,
                        Bool playerInv)
{
 I64 i, j;

 if(mc->prayerDragging)
  return FALSE;

 for(i = 0; i < INVWIDTH; i++){
  for(j = 0; j < INVHEIGHT; j++){
   I64 x1 = baseX + (i * 43);
   I64 y1 = baseY + (j * 42);
   I64 x2 = x1 + 43;
   I64 y2 = y1 + 42;

   if(InRect(M_X, M_Y, x1, y1, x2, y2)){
    InvDrag(i, j, inv, playerInv);
    return TRUE;
   }
  }
 }

 return FALSE;
}

Bool HandleWorldClick(I64 M_X, I64 M_Y, Actor *player)
{
 if(!NoGameWindowOpen(M_X,M_Y))
  return FALSE;

 I64 tx, ty;
 ScreenToWorldTile(M_X, M_Y, &tx, &ty);

 MapNode *mn = GetTensorNode(world->level, tx, ty, world->currentZ);
 I64 t = GetTensor(world->level, tx, ty, world->currentZ);

 player->pickUpTrigger = TRUE;

 AStarMoveActorTo(player, tx, ty, world->currentZ);
 AddDirective(EFFCLICK, player, M_X, M_Y);

 return TRUE;
}

Bool HandleDragUseClick(I64 M_X, I64 M_Y, Actor *player)
{
 if(!(M_Y < 480 - (42 * 4) && mc->draggingInv == TRUE))
  return FALSE;

 I64 wlvl = GetTensorWaterLevel(world->level,
                                player->x, player->y,
                                world->currentZ);

 if(UseItem(wlvl))
  return TRUE;

 return FALSE;
}
U0 HandleMouseTargeting(I64 mx, I64 my)
{
 if(mc->combatMenuSelection != CS_STRIKE &&
    mc->combatMenuSelection != CS_PRAYER2)
  return;

 Actor *hover = GetActorAtMouse(mx, my);

 if(hover){
  mc->mouseTargetingActive = TRUE;
  SetTargetFromActor(hover);
 }
}

U0 ClickHighlightedTarget(){
 Actor *p = GetPlayer;
 if(mc->combatON &&
   (mc->combatMenuSelection == CS_STRIKE ||
    mc->combatMenuSelection == CS_PRAYER2))
 {
  if(p->target != NULL){
   I64 idx = GetCTPIndexFromActor(p->target);
   if(idx != -1){
    mc->targetCTPIndex = idx;
   }

   // confirm action
   if(mc->combatMenuSelection == CS_STRIKE){
    mc->combatMenuSelection = CMS_STRIKE_DONE;
    PlayStrikeAnim(GetPlayer());

   }
   else if(mc->combatMenuSelection == CS_PRAYER2){
    mc->combatMenuSelection = CMS_PRAYER_DONE;
   }
  return TRUE;
  }
 }
 return FALSE;
}

U0 HandleMouse(I64 M_X, I64 M_Y, I64 i, I64 j)
{
 Actor *player = GetPlayer;

 /* 1. Sidebar / global UI first */
 HandleMouseSideBar(M_X, M_Y, i, j);

 /* 2. Only continue for game-area clicks */
 if(CombatDialog2Click(M_X, M_Y))
  return;
 if(ClickHighlightedTarget())
  return;
 if(!InGameArea(M_X, M_Y))
  return;
 
 /* 3. Drag-use item action */
 if(HandleDragUseClick(M_X, M_Y, player))
  return;

 /* 4. Equipment release */
 if(HandleMouseEquipRelease(M_X, M_Y, i, j))
  return;
 /* 5. Loot container grid */
 if(mc->lootedSwitch){
  if(HandleInvGridClick(M_X, M_Y, 2, 0, mc->lootInv, FALSE))
   return;
  if(InRect(M_X, M_Y, 432, 183, 480, 230)){
   TakeAllLoot(player);
   return;
  }
 }

 /* 6. Player inventory grid */
 if(mc->displayInventory == TRUE){
  if(HandleInvGridClick(M_X, M_Y, 2, 310, player->myInv, TRUE))
   return;
  if(mc->lootedSwitch)
   return;
 }

 /* 7. World click movement/pathing */
 if(HandleWorldClick(M_X, M_Y, player))
  return;
}

U0 HandleRMouse(I64 M_X, I64 M_Y, I64 i, I64 j)
{
}

//Hover to select target during targeting phases
Bool CombatDialog3Hover(I64 mx, I64 my)
{
 if(!mc->combatON)
  return FALSE;

 if(mc->combatMenuSelection == CS_STRIKE ||
    mc->combatMenuSelection == CS_PRAYER2)
 {
  HandleMouseTargeting(mx, my);
  return TRUE;
 }

 return FALSE;
}


//possibily make global to prevent refetch
//U8 *tooltip
U0 ShowToolTips(CDC *dc = gr.dc)
{
 I64 i,j;
 Inventory *me;
 Actor *player = GetPlayer;
 if(mc->displayInventory||mc->lootedSwitch){
 //check inventory region
  for(i=0;i<INVWIDTH;i++){
   for(j=0;j<INVHEIGHT;j++){
    Bool tipme = FALSE;
    if(mc->lootedSwitch&& camera->cursorX>=(i*43)+2    &&
       camera->cursorX< (i+1)*43+2&&
       camera->cursorY>=(j*42)  &&
       camera->cursorY< (j+1)*42){
     tipme = TRUE;
     me = mc->lootInv;
    }
    if(tipme||(camera->cursorX>=(i*43)+2    &&
       camera->cursorX< (i+1)*43+2&&
       camera->cursorY>=(j*42)+310  &&
       camera->cursorY< (j+1)*42+310)){
     if(!tipme)
      me = player->myInv;
     Item *item= RetrieveItem(me,me->mtrx[j][i].occupied);
     //TODOfix this defensive programming
     //inventory item not properly referenced/ old items removed
     if(!item || !item->name ||StrCmp(item->name,"Bag")==0){break;}                 
     dc->color = DKGRAY;
     I8 yinc = 0;
     if(item->v1!=NULL)
     {
      yinc =yinc+12;
      if(item->v2!=NULL)
      {
       yinc = yinc+12;
       if(item->v3!=NULL)
       {
         yinc = yinc+12;
       }
      }
     }
     dc->color = DKGRAY;
     GrRect3(dc,camera->cursorX+1,camera->cursorY+1,900,100,24+yinc);
     dc->color = LTBLUE;
     PrintLine(dc,item->name,camera->cursorX+2,camera->cursorY+2);
     dc->color = LTGRAY;
     PrintLine(dc,MStrPrint("%d%s",item->value," Silver"),
                            camera->cursorX+2,camera->cursorY+12+2);
     dc->color = WHITE;
   
     if(item->v1!=NULL)
      PrintLine(dc,item->v1,camera->cursorX+2,camera->cursorY+24+2);
     if(item->v2!=NULL)
      PrintLine(dc,item->v2,camera->cursorX+2,camera->cursorY+36+2);
     if(item->v3!=NULL)
      PrintLine(dc,item->v3,camera->cursorX+2,camera->cursorY+48+2);
    
    }//end inventory if
   }//end inventory height
  }//end inventory width
 }

 if(mc->displayPrayers&&!mc->prayerDragging&&!mc->draggingInv)
 {//mc->dragPrayer is set in FindPrayer
  if(FindPrayer()){
   i = mc->dragPrayer;

   U8* name = prayers->list[i]->name;  
   U8* cost = MStrPrint("%s%d%s","Cost:",prayers->list[i]->cost," Spirit"); 
   //U8* desc = StrSplit(prayers->list[i]->desc,'#');  
   
   dc->color = DKGRAY;
   GrRect3(dc,camera->cursorX+1,camera->cursorY+1,900,100,32);
   switch(prayers->list[i]->type)
   {
    case TYPE_A:   dc->color = GREEN;break;
    case TYPE_M:   dc->color = YELLOW;break;
    case TYPE_W:   dc->color = RED;break;
    case TYPE_P:   dc->color = LTBLUE;break;
   }
   PrintLine(dc,name,camera->cursorX+2,camera->cursorY+2);
   dc->color = LTCYAN;
   PrintLine(dc,cost,camera->cursorX+2,camera->cursorY+12+2);
   //dc->color = WHITE;
   //PrintLine(dc,desc,camera->cursorX+2,camera->cursorY+24+2);
  }
 }
}

