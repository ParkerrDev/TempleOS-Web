
class Object:CQue{
  I64 objID,chestID;
  Inventory *myInv;

} obj_que;

#define MAX_CHESTS 10

U0 GetItemScreenLoc(I64 invIDToFetch, I64 *x, I64 *y){
 I64 i,j; 
 Actor *p = GetPlayer;
 for(i=0;i<INVWIDTH;i++)
 {
  for(j=0;j<INVHEIGHT;j++)
  {
   if(p->myInv->mtrx[j][i].occupied==invIDToFetch)
   { 
    *x = i*45+2+15;
    *y = j*42+310;
    goto please_clap;
    
   }         
  }
 }
 please_clap:
}

U0 BuildChests(Inventory *inv, I64 id){
  switch(id){
   case CAMPCHEST:
    AddItemToInventory(inv,IT_POT);
    AddItemToInventory(inv,IT_POT);
    AddItemToInventory(inv,IT_POT);
    AddItemToInventory(inv,IT_SHIRT);   
    AddItemToInventory(inv,IT_FISH1);
    AddItemToInventory(inv,IT_FISH1);

   break; 

  }
}

U0 ObjQueInit()
{
 QueInit(&obj_que);
 Object *listItem;
 Inventory *newInv;
 I64 i;
 for(i=CAMPCHEST;i<MAX_CHESTS;i++){
  listItem = CAlloc(sizeof(Object));
  listItem->objID = i;
  listItem->chestID = i; 
  newInv = MakeInventory();
  BuildChests(newInv, i);
  listItem->myInv = newInv;
  QueIns(listItem,obj_que.last);
 }
 listItem=obj_que.next;
}


Inventory *GrabChest(I64 chestID){
 I64 i;
 Object *myObject= obj_que.next;
 for(i=0;i!=QueCnt(obj_que);i++){
  if(myObject->chestID==chestID){
   return myObject->myInv;
  }
  myObject = myObject->next;
 }
 Actor *player = GetPlayer;  
 return player->myInv; 
}

U0 FreeObjQue()
{
 QueDel(&obj_que);
 Free(&obj_que);
}

U0 BlotItem(CDC *target, Item *it, 
            I64 x, I64 y, Bool isPlayer,I64 rotate=0){
 //fix to take item hOff/wOff
 //todo mapping function to remove switch
 CDC *render;
 CDC *scratch = DCNew(100,100);
 DCFill(scratch, TRANSPARENT);
 Bool rescale = FALSE;
 // No item or no sprite invisible (same as IT_FIST before)
 if(!it || !it->img){
  render = scratch;
 }else {
  if(it->blotSX !=1.0||it->blotSY != 1.0) {
   render  = DCScaled(it->img, it->blotSX, it->blotSY);
   rescale = TRUE;
  }else {
   render = it->img;
  }
 }
 I64 yoff, xoff; 
 if (it != NULL)
  xoff = it->blotXOff, yoff = it->blotYOff;
 else
  xoff = BLOT_X_DEFAULT,yoff = BLOT_Y_DEFAULT;

 if(!isPlayer)//special case override for additional offset
  yoff = 10;
 if(rotate!=0){
  DCDepthBufAlloc(render);
  Mat4x4IdentEqu(render->r);
  Mat4x4RotX(render->r,tS*pi/4.0);
  render->flags|=DCF_TRANSFORMATION;
 }
 GrBlot(target,x+xoff,y+yoff,render);
 DCDel(scratch);
 if(rescale)
  DCDel(render);
}
