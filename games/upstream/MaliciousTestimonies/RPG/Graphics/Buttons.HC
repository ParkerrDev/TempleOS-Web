
U0 SaveButton()
{
 SaveForm;
}


U0 EquipButton()
{
 if(mc->displayEquipment==TRUE)
  mc->displayEquipment=FALSE;
 else
  mc->displayEquipment=TRUE;
}

U0 InvButton()
{
 if(mc->displayInventory==TRUE)
  mc->displayInventory=FALSE;
 else
  mc->displayInventory=TRUE;

}

U0 RunButton()
{
 if(mc->displayInventory==TRUE)
  mc->displayInventory=FALSE;
 else
  mc->displayInventory=TRUE;

}

U0 MusicButton()
{
 if(mc->musicMuted==FALSE)
  mc->musicMuted=TRUE;
 else
  mc->musicMuted=FALSE; 
}

U0 PrayerButton()
{
 if(mc->displayPrayers==FALSE)
  mc->displayPrayers=TRUE;
 else
  mc->displayPrayers=FALSE; 

}

U0 WorldButton()
{
 if(mc->displayWorld==FALSE)
  mc->displayWorld=TRUE;
 else
  mc->displayWorld=FALSE; 

}

U0 FxButton()
{
 if(mc->fxMuted==FALSE)
  mc->fxMuted=TRUE;
 else
  mc->fxMuted=FALSE; 
}

U0 IncPrayerPage(I64 i)
{
 mc->prayerPage = mc->prayerPage + i;
 if(mc->prayerPage<1)
 {
  mc->prayerPage = MAX_PRAYERS-(MAX_PRAYERS%9);
 }
 if(mc->prayerPage>MAX_PRAYERS)
 {
  mc->prayerPage=0;
 }
}

U0 PrayerCycleButton(Bool left)
{
 if(left)
  IncPrayerPage(-9);
 else
  IncPrayerPage(9);
}

U0 SetHotKey(I64 i , I64 v)
{
 I64 iter;
 for(iter = 0;iter<NUM_HOTKEYS;iter++)
 {
  if(hotkeys[iter] ==v)//only one prayer of each kind on the hotbar
   hotkeys[iter] =-1;
 }
 hotkeys[i] = v;               

}
Bool InRect(I64 mx, I64 my, I64 x1, I64 y1, I64 x2, I64 y2)
{
 return mx >= x1 && mx < x2 &&
        my >= y1 && my < y2;
}

U0 PrayerFilters(I64 M_X, I64 M_Y, I64 i, I64 j)
{
 I64 index;
 I64 x, y;

 /* cycle left */
 if(InRect(M_X, M_Y, 390, 81, 415, 102)){
  PrayerCycleButton(TRUE);
  return;
 }

 /* cycle right */
 if(InRect(M_X, M_Y, 590, 81, 615, 102)){
  PrayerCycleButton(FALSE);
  return;
 }

 /* dragging prayer onto hotbar */
 if(mc->prayerDragging == TRUE){
  index = 0;

  for(x = 10; x < 490; x += 50){
   if(InRect(M_X, M_Y, x, 0, x + 50, 50)){
    SetHotKey(index, mc->dragPrayer);
    mc->prayerDragging = FALSE;
    mc->dragPrayer = -1;
    return;
   }
   index++;
  }

  return;
 }

 /* pick up a prayer from prayer grid */
 for(x = 490; x < 640; x += 50){
  for(y = 102; y < 252; y += 50){
   if(InRect(M_X, M_Y, x, y, x + 50, y + 50)){
    mc->prayerDragging = TRUE;
    return;
   }
  }
 }
}

U0 EndDrag()
{
 mc->draggingInv=FALSE;
 mc->dragInvIsPlayer=TRUE;
 mc->draggingItem=NULL;
 mc->draggingID=0;

}

U0 ReleaseSword()
{
 Actor *player = GetPlayer;
 if(mc->draggingItem->equip_slot!=EQ_SLOT_WEP){
  //this should just cancel the drag but its a bit more complicated than that
  //AddItemToInventory(player->myInv,mc->draggingID);        

 }
 //switch from inv to sword, del from inv
 I64 equip =  player->sword;
 if(equip!=0){
  AddItemToInventory(player->myInv,player->sword);
 }
 player->sword =mc->draggingID;

 RemoveItemFromInv(player->myInv, mc->draggingItem, TRUE);                
 EndDrag; 

}

U0 ReleaseBody()
{
 Actor *player = GetPlayer;

 if(mc->draggingItem->equip_slot!=EQ_SLOT_BDY){
  //AddItemToInventory(player-myInv,mc->draggingID);        
  return;
 }

 //switch from inv to body, del from inv	
 I64 equip =  player->armor;
 if(equip!=0){
  AddItemToInventory(player->myInv,player->armor);
 }
 player->armor =mc->draggingID;

 RemoveItemFromInv(player->myInv, mc->draggingItem, TRUE);
 EndDrag; 

}

U0 ReleaseHelm()
{
 Actor *player = GetPlayer;

 if(mc->draggingItem->equip_slot!=EQ_SLOT_HLM){
  //AddItemToInventory(player->myInv,mc->draggingID);
  return;
 }

 //switch from inv to helm, del from inv
 I64 equip =  player->hat;
 if(equip!=0){
  AddItemToInventory(player->myInv,player->hat);
 }
 player->hat =mc->draggingID;

 RemoveItemFromInv(player->myInv, mc->draggingItem, TRUE);                 
 EndDrag; 

}
U0 ReleaseRing()
{

 Actor *player = GetPlayer;
 if(mc->draggingItem->equip_slot!=EQ_SLOT_RNG){
  //AddItemToInventory(player->myInv,mc->draggingID);       
  return;
 }         

 //switch from inv to helm, del from inv
 I64 equip =  player->ring1;
 if(equip!=0){
  AddItemToInventory(player->myInv,player->ring1);
 }
 player->ring1 =mc->draggingID;
 
 RemoveItemFromInv(player->myInv, mc->draggingItem, TRUE);                 
 EndDrag;
}

Bool UseItem(I64 wlvl=0){
 if(mc->lootedSwitch==FALSE){
  Actor *player = GetPlayer;
  if(wlvl>0){
   switch(mc->draggingID){
    case IT_POT:
     RemoveItemFromInv(player->myInv, mc->draggingItem, TRUE);
     AddItemToInventory(player->myInv,IT_WPOT);
     EndDrag;
     return TRUE;
    break;
   }    
  }
  if(mc->draggingItem->usable){
   switch(mc->draggingID){//todo parse from description?
    case IT_FISH1:
     RemoveItemFromInv(player->myInv, mc->draggingItem, TRUE);
     RemoveMana(player,-10);   
     EndDrag;
    break;
    case IT_HPPOT:
     RemoveItemFromInv(player->myInv, mc->draggingItem, TRUE);
     RemoveHealth(player,-25);
     EndDrag;
    break;
   } 
  }
 }
 return FALSE;
}

//place item (pitem) is the item on the tile
//mc->draggingItem = to 
U0 CombineIfPossible(I64 pItem)
{

 Actor *player = GetPlayer;
 Item *item= RetrieveItem(player->myInv,pItem);

 switch(mc->draggingID)
 {
  case IT_WPOT:
   if(item->id==IT_BULB){
    RemoveItemLocID(pItem,TRUE);
    RemoveItemFromInv(player->myInv, mc->draggingItem, TRUE);
    AddItemToInventory(player->myInv,IT_HPPOT);    
    EndDrag;

   }
  break;  
  case IT_BULB:
   if(item->id==IT_WPOT)
   {
    RemoveItemLocID(pItem,TRUE);
    RemoveItemFromInv(player->myInv, mc->draggingItem, TRUE);
    AddItemToInventory(player->myInv,IT_HPPOT); 
    EndDrag;

   }
  break;  
 }
}


//check if user click or release for each 'button' of inventory
//i: inv width
//j: inv height
U0 InvDrag(I64 i, I64 j,Inventory *myInv,Bool isPlayer=TRUE){
 Bool marked = FALSE;                 
 I8 occupied;
 occupied= myInv->mtrx[j][i].occupied;                 
 
 if(mc->draggingInv==FALSE){//start dragging
  if(occupied!=-1){//if there is an item underneath
   mc->draggingID = RetrieveItemID(myInv,occupied,TRUE);
   mc->draggingItem = RetrieveItem(myInv,occupied);
   mc->draggingItem->visible = FALSE;
   mc->dragInvIsPlayer = isPlayer;
   mc->draggingInv=TRUE;
  }
 }else{//release
  //if there is an item underneath
  if(occupied!=-1&&occupied!=mc->draggingItem->invID){//continue drag
   marked = TRUE;
   CombineIfPossible(occupied);
  }else{//if open space, drop and release w=1 h=2
   U8 itemW, itemH;
   U8 invHMax= mc->draggingItem->h;
   U8 invWMax = mc->draggingItem->w;
   mc->draggingItem->visible=TRUE;
   for(itemW=0;itemW<invWMax;itemW++) {
    for(itemH=0;itemH<invHMax;itemH++) {
     I64 tempOccupied;
     tempOccupied = myInv->mtrx[j+(itemH)][i+(itemW)].occupied;
     if(tempOccupied!=-1&& tempOccupied!=mc->draggingItem->invID){
      marked=TRUE;break;
     }
    }
    if(marked){//check if we can combine
     CombineIfPossible(occupied);
     break;
    }
   }
  }
  if(!marked){
   ChangeItemLoc(i, j, mc->draggingItem, myInv, isPlayer);                 
   EndDrag; 
  }
 }//end release
}

