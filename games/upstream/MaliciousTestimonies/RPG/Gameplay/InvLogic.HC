Bool InventoryHasAnyItems(Inventory *inv)
{
 I64 i, j;
 for(j = 0; j < INVHEIGHT; j++){
  for(i = 0; i < INVWIDTH; i++){
   if(inv->mtrx[j][i].occupied != -1)
    return TRUE;
  }
 }
 return FALSE;
}

Bool SeenInvID(I64 *seen, I64 seenCount, I64 id)
{
 I64 k;
 for(k = 0; k < seenCount; k++){
  if(seen[k] == id)
   return TRUE;
 }
 return FALSE;
}

/*Bool TryTakeOneLootItem(Actor *p, I64 itemID)
{
 Object *item;
 item = RetrieveItem(mc->lootInv, itemID);
 if(item == NULL)
  return FALSE;

 /* You need a direct inventory insertion helper here.
    Replace this with your actual placement routine. */
 if(!AutoPlaceItemInInventory(item, p->myInv, TRUE))
  return FALSE;

 return TRUE;
}*/
//convert inv id to item id
I64 *RetrieveItemID(Inventory *myInv, I64 index,  Bool select=FALSE){
 Item *toBeRetrieved = myInv->collection->next;
 I64 i;
 for(i=0;i<QueCnt(toBeRetrieved);i++){
  toBeRetrieved = toBeRetrieved->next;
  if(toBeRetrieved->invID==index)
   break;
 }
 if(select){//move to mouse
  toBeRetrieved->visible = FALSE;
  return toBeRetrieved->id;
 }else{  
  toBeRetrieved->visible = TRUE;
  return toBeRetrieved->id;
 }
}

//convert inv id to item
Item *RetrieveItem(Inventory *myInv, I64 index,Bool select=FALSE){
 Item *toBeRetrieved = myInv->collection->next;
 I64 i;
 if(index<=0) return toBeRetrieved;
 for(i=0;i<QueCnt(toBeRetrieved);i++){
  toBeRetrieved = toBeRetrieved->next;
  if(toBeRetrieved->invID==index)
   break;
 }
 if(select){//move to mouse
  toBeRetrieved->visible = FALSE;
  return toBeRetrieved;
 }
 return toBeRetrieved;
}

//THIS SHOULD DEPRECATE RemoveItemFromLoc
U0 RemoveItemFromInv(Inventory *inv, Item *item, Bool delete = FALSE)
{
 I64 i,j;

 // update matrix
 for(i=0;i<INVWIDTH;i++){
  for(j=0;j<INVHEIGHT;j++){
   I64 valueToUpdate = inv->mtrx[j][i].occupied;

   if(valueToUpdate == item->invID){
    valueToUpdate = IT_NULL;
   }
   if(valueToUpdate > item->invID){
    valueToUpdate--;
   }

   inv->mtrx[j][i].occupied = valueToUpdate;
  }
 }

 if(delete){
  Item *cur = inv->collection->next;

  for(i=0;i<=item->invID;i++)
   cur = cur->next;

  for(i=item->invID;i<inv->count;i++){
   cur->invID--;
   cur = cur->next;
  }

  inv->count--;
  QueRem(item);
  Free(item);
 }
}

//item is a invID
//removes inventory item by invID reference
U0 RemoveItemLocID(I64 invID, Bool delete =FALSE){
 I64 i,j;
 Actor *player = GetPlayer();
 Item *torm = RetrieveItem(player->myInv,invID);
 
 //remove old loc,update other items index in rendered matrix
 for(i=0;i<INVWIDTH;i++){
  for(j=0;j<INVHEIGHT;j++){
   I64 valueToUpdate = player->myInv->mtrx[j][i].occupied;
   if(valueToUpdate==invID){
    valueToUpdate = IT_NULL;
   }
   if(valueToUpdate>invID){
    valueToUpdate = valueToUpdate-1;
   } 
   player->myInv->mtrx[j][i].occupied = valueToUpdate;
  }
 }

 if(delete){
  Item *cur = player->myInv->collection->next;
  for(i=0;i<=invID;i++)
   cur = cur->next;
  for(i=invID;i<player->myInv->count;i++){
   cur->invID--;
   cur = cur->next;
  }
  player->myInv->count--; 
  QueRem(torm);
  Free(torm);
 }
}


class CoinObj{
 Item *oldShek;
 I64 itemID;
 I64 newVal;
};

Item *HasShekel(Inventory *myInv)
{ 
 Item *toBeRetrieved = myInv->collection->next;
 I64 i;
 for(i=0;i<QueCnt(toBeRetrieved);i++){
  toBeRetrieved = toBeRetrieved->next;
  if(toBeRetrieved->id>=IT_SHEKEL&&toBeRetrieved->id<=IT_SHEKEL100)
   return toBeRetrieved;
 }
 return NULL;
}

Bool AddCoin(Inventory *myInv, I64 itemID){
 I64 i,v =0;
 I64 v2Add = 0;

 if(itemID>=IT_SHEKEL&&itemID<=IT_SHEKEL100){
  Item *shekel = HasShekel(myInv);
  CoinObj *heap = MAlloc(sizeof(CoinObj));
  heap->oldShek = NULL;
  if(shekel!=NULL){
   v = shekel->value;
   heap->oldShek = shekel;
  }

  switch(itemID){
    case IT_SHEKEL: v2Add++; break;
    case IT_SHEKEL2: v2Add = 2; break;
    case IT_SHEKEL10: v2Add = 10;break;
    case IT_SHEKEL100: v2Add = 100;break;
  }
  I64 nV = v+v2Add;
  switch(nV) {
    case 1: heap->itemID = IT_SHEKEL; break;
    case 2...9: heap->itemID = IT_SHEKEL2; break;
    case 10...99: heap->itemID = IT_SHEKEL10; break;
    default: heap->itemID = IT_SHEKEL100; break;
  }
  heap->newVal = nV;
  return heap;

 }

 return NULL;
}

Bool AddItemToInventory(Inventory *myInv, I64 itemID){
 I64 i,j,x,y,area;
 CoinObj *purse = AddCoin(myInv,itemID);
 retry:
 Item *item;
 if(purse!=NULL){
  item = MakeItem(purse->itemID);
 }else{
  item = MakeItem(itemID);
 }
 
 for(i=0;i<INVWIDTH;i++){
  for(j=0;j<INVHEIGHT;j++){
   area=0;
   
   //find an opening
   for(x=item->w-1;x>=0;x--){
    if(i+x>=11)
     goto skip_num;
 
    for(y=item->h-1;y>=0;y--){
     if(j+y>=4)
      goto skip_num;
     I64 cv = myInv->mtrx[j+y][i+x].occupied;
     if(purse!=NULL){
      if(purse->oldShek!=NULL){
       if(cv<0||cv==purse->oldShek->invID)
        area++;
      }else {goto norm;}
     }else{
      norm:
      if(cv<0)
       area++;
     }  
    }
   }

   //if an opening is found, add the new item
   if(area==(item->h)*(item->w)){

    //remove old purse if this is coinage
    if(purse!=NULL){
     if(purse->oldShek!=NULL){
      RemoveItemFromInv(GetPlayer()->myInv, mc->draggingItem, TRUE);
     }
    }
 
    QueIns(item,myInv->collection->last);
    I64 cnt = ++myInv->count;
    for(x=item->w-1;x>=0;x--){  
     for(y=item->h-1;y>=0;y--){
      myInv->mtrx[j+y][i+x].occupied = cnt;
     }
    }
    item->invID = cnt;
    //update new coin value
    if(purse!=NULL){
     item->value = purse->newVal;
     Free(purse);
    }

    return TRUE;
   }
  }
  skip_num:
 }

 //if we don't have room for the extra silver, add only what we can
 if(purse!=NULL){
  Free(item);
  switch(purse->itemID){
    case IT_SHEKEL: goto fail; break;
    case IT_SHEKEL2: goto fail; break;
    case IT_SHEKEL10: purse->itemID=IT_SHEKEL2;purse->newVal=9;break;
    case IT_SHEKEL100: purse->itemID=IT_SHEKEL10; purse->newVal=99;break;
  }

  goto retry;
  fail:
  Free(purse);
 }
 return FALSE;

}
U0 TakeAllLoot(Actor *p)
{
 I64 i, j;
 I64 seen[INVWIDTH * INVHEIGHT];
 I64 seenCount;
 Bool movedOne;
 Bool movedAny = FALSE;

 if(!mc->lootedSwitch || mc->lootInv == NULL)
  return;

 while(TRUE){

  movedOne = FALSE;
  seenCount = 0;

  for(j = 0; j < INVHEIGHT; j++){
   for(i = 0; i < INVWIDTH; i++){

    I64 occ = mc->lootInv->mtrx[j][i].occupied;
    if(occ < 0)
     goto conti;

    if(SeenInvID(seen, seenCount, occ))
     goto conti;

    seen[seenCount++] = occ;

    Item *item = RetrieveItem(mc->lootInv, occ);
    if(item == NULL)
     goto conti;

    if(AddItemToInventory(p->myInv, item->id)){
     RemoveItemFromInv(mc->lootInv, item, TRUE);

     movedOne = TRUE;
     movedAny = TRUE;

     goto restart_scan;
    }

    conti:
    ;
   }
  }

  // nothing moved this pass → exit loop
  if(!movedOne)
   break;

  restart_scan:
  ;
 }

 if(!InventoryHasAnyItems(mc->lootInv)){
  mc->lootedSwitch = FALSE;
  mc->lootInv = NULL;
 }
}
