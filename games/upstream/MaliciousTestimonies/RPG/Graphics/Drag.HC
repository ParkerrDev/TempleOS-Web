 
CDC *RenderInventory(Inventory *myInv,Bool isPlayer=TRUE){
 I64 i,j,i2;
 CDC *newInventoryRender = DCNew(640,480);
 DCFill(newInventoryRender, TRANSPARENT);
 //items
 U8 *listOfRenderedItems = CAlloc(sizeof(I64)*(INVWIDTH*INVHEIGHT));
 U16 renderListSize = 0;
 for(i=0;i<INVWIDTH;i++){
  for(j=0;j<INVHEIGHT;j++){
   I8 occupied= myInv->mtrx[j][i].occupied;
   if(occupied!=IT_NULL){
    Bool alreadyScanned = FALSE;
    for(i2=0;i2<renderListSize;i2++){
      if(occupied ==listOfRenderedItems[i2])
       alreadyScanned=TRUE;
    }
    if(!alreadyScanned){
     listOfRenderedItems[renderListSize] = occupied;
     renderListSize++;
     Item *ito =RetrieveItem(myInv,occupied);
     if(ito->visible){
      I64 currentItemID = ito->id;
     //might glitch if two same items in the same spot
     //if(mc->draggingID!=currentItemID&&mc->draggingItem->invID!=occupied){
     //I64 currentItemID= currentItem->id; 
      BlotItem(newInventoryRender, ito,
               i*camera->dividX,j*camera->dividY,isPlayer);
     }    
    }
   }
  }
 }
 Free(listOfRenderedItems);
 
 return newInventoryRender;

}


CDC *RenderEquipment(Actor *player){

  CDC *completeMenu = DCNew(160,300);

  DCFill(completeMenu, BLACK);

  completeMenu->color=LTGRAY;
  GrRect3(completeMenu,0,0,0,160,3);
  GrRect3(completeMenu,0,0,0,3,300);
  GrRect3(completeMenu,0,297,0,160,3);
  GrRect3(completeMenu,157,0,0,3,300);

  completeMenu->color=WHITE;
  I64 i;
  U8 *title = "Equipment";
 
  U8 *a = "HELM";
  U8 *b = "WEPN";
  U8 *c = "BODY";
  U8 *d = "RING";
  PrintLine(completeMenu,title,7,7);
 

  //helm
  Sprite3B(completeMenu,8,25,10,GetMenuSprite(MENU_INVBOX));
  Sprite3B(completeMenu,8+camera->dividX,25,10,GetMenuSprite(MENU_INVBOX));
  Sprite3B(completeMenu,8,25+camera->dividY,10,GetMenuSprite(MENU_INVBOX));
  Sprite3B(completeMenu,8+camera->dividX,25+camera->dividY,10,GetMenuSprite(MENU_INVBOX));
  PrintLine(completeMenu,a,26,60);
  //hat
  I64 wepn = GetPlayer()->hat;
  if(wepn>IT_FIST)
  {
   switch(wepn){
    case IT_HELM://iron helm  
     GrBlot3(completeMenu,18,
             44,0,DCScaled(ITEM5I,.5,.5));
     break;
   }
  }
 
  //wepn bkgrd
  Sprite3B(completeMenu,8,116,10,GetMenuSprite(MENU_INVBOX));
  Sprite3B(completeMenu,8,116+camera->dividY,10,GetMenuSprite(MENU_INVBOX));
  Sprite3B(completeMenu,8,116+2*camera->dividY,10,GetMenuSprite(MENU_INVBOX));
  Sprite3B(completeMenu,8,116+3*camera->dividY,10,GetMenuSprite(MENU_INVBOX));
  PrintLine(completeMenu,b,14,180);
  //wepn
  wepn = GetPlayer()->sword;
  if(wepn>IT_FIST){
   switch(wepn){
    case IT_DAGGER://dagger   
     GrBlot3(completeMenu,8,
             116+(camera->dividY),0,ITEM1I);
    break;
    case IT_HARPOON://harpoon   
     GrBlot3(completeMenu,8,
             116,0,ITEM2I);
    break;
    case IT_BRZSWORD:   
     GrBlot3(completeMenu,8,
             116,0,ITEM20I);
    break;
    case IT_HAMMER:  
     GrBlot3(completeMenu,8,
             116,0,ITEM21I);
    break;
    case IT_HATCHET://axe   
     GrBlot3(completeMenu,8,
             116,0,ITEM22I);
    break;

   }
  }
   
  //body
  Sprite3B(completeMenu,60,140,10,GetMenuSprite(MENU_INVBOX));
  Sprite3B(completeMenu,60+camera->dividX,140,10,GetMenuSprite(MENU_INVBOX));
  Sprite3B(completeMenu,60,140+camera->dividY,10,GetMenuSprite(MENU_INVBOX));
  Sprite3B(completeMenu,60+camera->dividX,140+camera->dividY,10,GetMenuSprite(MENU_INVBOX));
  Sprite3B(completeMenu,60,140+2*camera->dividY,10,GetMenuSprite(MENU_INVBOX));
  Sprite3B(completeMenu,60+camera->dividX,140+2*camera->dividY,10,GetMenuSprite(MENU_INVBOX));
 
  PrintLine(completeMenu,c,75,190);
  //armr
  wepn = GetPlayer()->armor;
  if(wepn>IT_FIST)
  {    CDC *render;
 
   switch(wepn){
    start:
     case IT_SHIRT://Cloth
     render = DCScaled(ITEM6I,.9,.9);
     GrBlot3(completeMenu,60,
             159,0,render);
     break;
     case IT_SHIRTR:
     render = DCScaled(ITEM6IR,.9,.9);
     GrBlot3(completeMenu,60,
             159,0,render);
     break;
     case IT_SHIRTG:
     render =DCScaled(ITEM6IG,.9,.9);  
     GrBlot3(completeMenu,60,
             159,0,render);
     break;
     case IT_SHIRTB:
     render = DCScaled(ITEM6IB,.9,.9); 
     GrBlot3(completeMenu,60,
             159,0,render);
     break;
     case IT_SHIRTP:
     render = DCScaled(ITEM6IP,.9,.9);   
     GrBlot3(completeMenu,60,
             159,0,render);
     break;
    end:
     DCDel(render);
    break;
   }
  }
   
  //ring
  Sprite3B(completeMenu,106,35,10,GetMenuSprite(MENU_INVBOX));
  PrintLine(completeMenu,d,112,48);
    

 Sprite3B(completeMenu,140,0,1,GetMenuSprite(MENU_XBUTTON));//xbutton
    
 return completeMenu;   
  

}

U0 LiveOptionsSave()
{

}

U0 DeserializeOpts()
{
 
 U8 *fptr =FileRead(OPTS_FILE);
 U8 *lnptr,*ln,*temp;
 StrUtil(fptr,SUF_REM_CTRL_CHARS);
 U8 id[8],*idptr=id;
 U8 val[8],*valptr=val;

 lnptr=fptr;

 //I32 count = 0;
 ln=ReadALine(&lnptr);
 //{
  //"%s",ln;
  //if(count!=textID||*ln=='#'||*ln==0)
  // goto skip;
 StrScan(ln,"%s\t%s",&idptr,&valptr);
 mc->fxMuted = valptr;
 ln=ReadATextLine(&lnptr);
 StrScan(ln,"%s\t%s",&idptr,&valptr);
 mc->musicMuted = valptr;
 Free(ln);
 //}
 Free(fptr);

}

U0 DrawPrayerHotbar(CDC *pm)
{
  pm->color = BLACK;
  GrRect3(pm,0,0,0,450,50);
  U8* _1 = "1";  U8* _2 = "2";  U8* _3 = "3";  U8* _4 = "4";  U8* _5 = "5";
  U8* _6 = "6";  U8* _7 = "7";  U8* _8 = "8";  U8* _9 = "9";  

  pm->color = WHITE;  
  Sprite3B(pm,10,0,10,GetMenuSprite(MENU_INVBOX));
  PrintLine(pm,_1,35,2,2);
  Sprite3B(pm,60,0,10,GetMenuSprite(MENU_INVBOX));
  PrintLine(pm,_2,85,2,2);
  Sprite3B(pm,110,0,10,GetMenuSprite(MENU_INVBOX));
  PrintLine(pm,_3,135,2,2);
  Sprite3B(pm,160,0,10,GetMenuSprite(MENU_INVBOX));
  PrintLine(pm,_4,185,2,2);
  Sprite3B(pm,210,0,10,GetMenuSprite(MENU_INVBOX));
  PrintLine(pm,_5,235,2,2);
  Sprite3B(pm,260,0,10,GetMenuSprite(MENU_INVBOX));
  PrintLine(pm,_6,285,2,2);
  Sprite3B(pm,310,0,10,GetMenuSprite(MENU_INVBOX));
  PrintLine(pm,_7,335,2,2);
  Sprite3B(pm,360,0,10,GetMenuSprite(MENU_INVBOX));
  PrintLine(pm,_8,385,2,2);
  Sprite3B(pm,410,0,10,GetMenuSprite(MENU_INVBOX));
  PrintLine(pm,_9,435,2,2);

  I64 i;
  for(i=0;i<NUM_HOTKEYS;i++)
  {
   if(hotkeys[i]!=-1){
    BlotPrayer(pm,10+(50*(i)),0,hotkeys[i]);

   }
  
  }   

}

//check if user click or release for each 'button' of prayers
U0 DragPrayer(CDC *pm)
{
//avoid conflict with inventory
 if(mc->draggingInv==FALSE&&mc->prayerDragging) 
 {
  if(mc->dragPrayer!=-1)//if we have a prayer
  {
   I64 x = camera->cursorX+3-(prayers->list[mc->dragPrayer]->wOff);
   I64 y = camera->cursorY-(prayers->list[mc->dragPrayer]->hOff);

    BlotPrayer(pm,x,y,mc->dragPrayer);
  }
 
  DrawPrayerHotbar(pm);
 }
}

U0 RPGInvLogic(I64 i, I64 j, CDC *dc, Actor *p)
{
 if(mc->lootedSwitch)//chest/merchant/corpse transfer
 {
   dc->color = BLACK;
   GrRect3(dc,0,0,0,480,190);

   for(i=0;i<INVWIDTH;i++)
   {
    for(j=0;j<INVHEIGHT;j++)
    {   
     Sprite3B(dc,i*camera->dividX+2,j*camera->dividY,
              0,GetMenuSprite(2));
    }
   }

   CDC *invR = RenderInventory(mc->lootInv, FALSE);
   GrBlot3(dc,0,0,10,invR);
   DCDel(invR);

   I64 takeAllX =(INVWIDTH-1)*camera->dividX+2;
   I64 takeAllY= (INVHEIGHT)*camera->dividY+2; 
   Sprite3B(dc,takeAllX,takeAllY,0,GetMenuSprite(MENU_MENUBOX));
   dc->color = BLACK;
   U8* tatxt = "TAKE";
   U8* tatxt2 = "ALL";
   PrintLine(dc,tatxt,takeAllX+10,takeAllY+16);
   PrintLine(dc,tatxt2,takeAllX+10,takeAllY+28);

   //Sprite3B(dc,510,52,0,GetMenuSprite(MENU_T));
 }

 if(mc->displayInventory)//inventory
 {
   dc->color = BLACK;
   GrRect3(dc,0,300,0,480,190);

   for(i=0;i<INVWIDTH;i++)
   {
    for(j=0;j<INVHEIGHT;j++)
    {   
     Sprite3B(dc,i*camera->dividX+2,j*camera->dividY+300,
              0,GetMenuSprite(2));
    }
   }

   CDC *invP = RenderInventory(p->myInv);
   GrBlot3(dc,0,0,10,invP);
   DCDel(invP);

   Sprite3B(dc,460,280,0,GetMenuSprite(MENU_XBUTTON));

   if(mc->draggingInv){
     BlotItem(dc,mc->draggingItem,
              camera->cursorX+2-(mc->draggingItem->wOff),
              camera->cursorY-270-(mc->draggingItem->hOff),TRUE);
   } 
 }
}
