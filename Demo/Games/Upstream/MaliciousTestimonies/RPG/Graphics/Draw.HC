

U0 ReDrawWorld(CDC *dc, I64 i, I64 j){
 for(i=-1;i<12;i++){
  if(camera->topLR+i<wX&&camera->topLR+i>=0){
   I64 screenX = i*camera->dividX+camera->cameraOffSetX;
   for(j=-1;j<12;j++){
    if(camera->topUD+j<wY&&camera->topUD+j>=0){
     I64 screenY = j*camera->dividY+camera->cameraOffSetY;
     I64 tileX = camera->topLR+i;
     I64 tileY = camera->topUD+j;
     I16 c = GetTensor(world->level,tileX,tileY,world->currentZ);
     dc->color = GetBG(c);
     GrRect3(dc,screenX, screenY, -1, camera->dividX, camera->dividY);
     if(c>=BG_LT_GRAY){
      switch(c){
       case BG_LT_GRAY:
        Sprite3B(dc,screenX,screenY,0,GetRoad);
        I16 c2 = GetTensor(world->level,tileX,Max(tileY-1,0),world->currentZ);
        if(c2==BG_GREEN)
         Sprite3B(dc,screenX,screenY,0,GetTransition(DIR_UP));
        c2 = GetTensor(world->level,tileX,Min(tileY+1,wY),world->currentZ);
        if(c2==BG_GREEN)
         Sprite3B(dc,screenX,screenY,0,GetTransition(DIR_DOWN));
        c2 = GetTensor(world->level,Max(tileX-1,0),tileY,world->currentZ);
        if(c2==BG_GREEN)
         Sprite3B(dc,screenX,screenY,0,GetTransition(DIR_LEFT));
        c2 = GetTensor(world->level,Min(tileX+1,wX),tileY,world->currentZ);
        if(c2==BG_GREEN)
         Sprite3B(dc,screenX,screenY,0,GetTransition(DIR_RIGHT));
       break;
       case BG_DK_GRAY:
        Sprite3B(dc,screenX,screenY,0,GetWall1);
       break;
       case BG_LT_RED:
        Sprite3B(dc,screenX,screenY,0,GetCarpet);
       break;
       case BG_ROCK_WALL:
        Sprite3B(dc,screenX,screenY,0,GetRockWall);
       break;
       case BG_BUSH_WALL:
        Sprite3B(dc,screenX,screenY,0,GetBushWall);
       break;
       case BG_GRASS:
        Sprite3B(dc, screenX+5, screenY, 0, GetPlant(OBJ_GRASSL));
        Sprite3B(dc, screenX+10, screenY, 0, GetPlant(OBJ_GRASSR));
       break;
      } 
     }
    }
   }
  }
 }

}

//obj is relevent if we need to shift rendering
//such as in the case of a stall on this tile
//i - x coordinate of node
//j - y coordinate of node
//l - size of item array on layer (multidraw)
// to use grWOff/HOff (TODO)
U0 DrawItemsOnLayer(CDC *dc,I64 obj, I64 i,I64 j,I64 l)
{

 MapNode *mn = GetTensorNode(world->level,
                    camera->topLR+i,camera->topUD+j, 
                    world->currentZ);
 CDC *scratch = DCNew(100,100);
 DCFill(scratch,TRANSPARENT);

 I64 yOffset = 0;
 if(obj==OBJ_STALL)
  yOffset = -32;
  

 for(l=0;l<mn->len;l++){
  Bool recolor = FALSE;
  CDC *endRender = NULL; 
  I64 item = (GetItem(mn,l))->id;
  switch(item){
   case IT_FIST:
   case IT_NULL:
    endRender = scratch;
   break;
   case IT_DAGGER:
    endRender = ITEM1;
   break;
   case IT_HARPOON:
    endRender = ITEM2;
   break;
   case IT_HELM:
    endRender = ITEM5;
   break;
   case IT_SHIRT:
    endRender = ITEM6;
   break;
   case IT_SHIRTR: 
    endRender = ITEM6R;
   break;
   case IT_SHIRTG: 
    endRender = ITEM6G;
   break;
   case IT_SHIRTB:    
    endRender = ITEM6B;
   break;
   case IT_SHIRTP:
    endRender = ITEM6P;
   break;
   case IT_POT:
   case IT_WPOT:
   case IT_HPPOT:
    endRender = ITEM10;
   break;
   case IT_SHEKEL:
    endRender = ITEM16;
   break;
   case IT_SHEKEL2:
    endRender = ITEM17;
   break;
   case IT_SHEKEL10:
    endRender = ITEM18;
   break;
   case IT_SHEKEL100:
    endRender = ITEM19;
   break;
   case IT_BRZSWORD:
    endRender = ITEM20;
   break;
   case IT_HAMMER:
    endRender = ITEM21;
   break;
   case IT_HATCHET:
    endRender = ITEM22;
   break;

   default:
    break;
  }
  GrBlot3(dc,i*camera->dividX+camera->cameraOffSetX,
             j*camera->dividY+camera->cameraOffSetY-6+yOffset,
             10,endRender);

 }
 DCDel(scratch); 

}


U0 DrawObjsOnLayer(CDC *dc, I64 obj, 
                   I64 screenX, I64 screenY, Actor *p,
                   I64 tileX, I64 tileY)
{
 switch(obj){
  case OBJ_WOOD:
   Sprite3(dc,screenX, screenY,20,GetFurniture(obj));
   if(!HasDirective(EFFFIRE,p,tileX,tileY)){
    AddDirective(EFFFIRE,p,screenX-32,screenY-25,tileX,tileY);
   }
   else{
    UpdateDirective(EFFFIRE,p,screenX-32,screenY-25,30,FALSE,tileX,tileY);
   }
  break;
  case SP_FISHING_SPOT:
   if(world->timer<FRAMERULE_CAP/2){ 
    GrBlot3(dc,screenX-6-13,screenY-16,10,SPECIAL1);
   }else{
    GrBlot3(dc,screenX-6-13, screenY-16,10, SPECIAL2);
  
   } 
  break;
  case OBJ_CHEST:
   Sprite3(dc, screenX-16, screenY-12, 10, GetFurniture(obj));
  break;
  case OBJ_POPPY:
  case OBJ_POPHV:
   Sprite3(dc, screenX, screenY, 10, GetPlant(obj));
  break;
  case OBJ_OLIVETREE:
   Sprite3(dc, screenX-58, screenY-148, 10, GetOliveTree(TILETREE));
   Sprite3(dc, screenX+5, screenY-54, 10, GetOliveTree(IT_OLIVEBRANCH));
   Sprite3(dc, screenX-48, screenY-42, 10, GetOliveTree(TILETRUNK));
  break; 
  case OBJ_GRASSF:
   Sprite3(dc, screenX-5, screenY, 0, GetPlant(OBJ_GRASSL));
   Sprite3(dc, screenX, screenY, 00, GetPlant(OBJ_GRASSR));
  break;
  case OBJ_WFRAME:
   Sprite3(dc,screenX-6, screenY-32,20,GetFurniture(obj));
   if(!HasDirective(EFFBANNER,p,tileX,tileY)){
    AddDirective(EFFBANNER,p,screenX-8,screenY-72,tileX,tileY);
   }
   else{
    UpdateDirective(EFFBANNER,p,screenX-8,screenY-72,30,FALSE,tileX,tileY);
   }

  break;
  case OBJ_STALL:
   GrBlot3(dc,screenX-72,screenY-124,10,CLUT004);
  break;
  case OBJ_FORGE:
    GrBlot3(dc,screenX-32,screenY-64,10,CLUT005);
  break;
  case OBJ_BED1:
    GrBlot3(dc,screenX-6,screenY-16,10,CLUT001);
  break;
  case OBJ_ANVIL:
    GrBlot3(dc,screenX-6,screenY-16,10,CLUT006);
  break;
  case OBJ_WBENCH:
    GrBlot3(dc,screenX-50,screenY,10,CLUT007);
  break;
  case OBJ_CANOPY:
    GrBlot3(dc,screenX-50,screenY-214,10,CLUT008);
  break;
  case OBJ_CROOFNE:
  case OBJ_CROOFNW:
  case OBJ_CROOFSE:
  case OBJ_CROOFSW:
  case OBJ_ROOF002:
   break;
  case OBJ_WALL002:
    GrBlot3(dc,screenX-19,screenY-76,10,WALL002);
  break;
  case OBJ_WALL003:
    GrBlot3(dc,screenX-23,screenY-120,10,WALL003);
  break;
  default:
   Sprite3(dc, screenX, screenY, 10, GetFurniture(obj));
  break;
 }
}



//
// Draw Actor(s) On Layer
//
//device context, Actor NPC ID
//tile x (i), tile j (j) //screen tile #
//Actor to be drawn
//approx screenX, approx screenY,
U0 DrawActorsOnLayer(CDC *dc,I64 npc, 
 I64 i, I64 j, 
 Actor *p, 
 I64 screenX, I64 screenY, I64 wlvl)
{
 //Actors start by converting matrix x,y position to screen X,Y
 Actor *toRender;
 I64 npcOffX=-camera->cameraOffSetX; 
 I64 npcOffY=-camera->cameraOffSetY;


 Bool isPlayer=FALSE;
 if(npc==mc->localPlayerId){
  isPlayer=TRUE;
  toRender = p; 
 }else {  toRender = GetNPC(npc); }
  if(toRender == NULL)//multiplayer error handling
  {
   PrintDevMessage(
    MStrPrint("Missing Actor %d",npc)
   );
   return;
  }
 Bool isAnimated = HasDirective(BOUNCE,toRender);// ||
 if(isPlayer||(!isAnimated)){
  GetActorScreenX(toRender,npcOffX,i,isPlayer);
  GetActorScreenY(toRender,npcOffY,j,isPlayer);
 }else if(isAnimated&&GetPlayer()->walking!=DIR_IDLE){
  if(mc->combatON==FALSE){
   UpdateDirective(BOUNCE,toRender,    
   GetActorScreenX(toRender,npcOffX,i,isPlayer),
   GetActorScreenY(toRender,npcOffY,j,isPlayer),0,TRUE);
  }else{
   UpdateDirective(BOUNCE,toRender,    
   GetActorScreenX(toRender,npcOffX,i,isPlayer),
   GetActorScreenY(toRender,npcOffY,j,isPlayer),0);

  }
 }
 switch(mc->combatMenuStage){
  case STAGE_0:
   switch(mc->combatMenuSelection){
    case CS_PRAYER:
     DrawPrayerHotbar(dc);
     break;
   }
  break;
 }   

 Bool isHighlight =FALSE;  
 isHighlight = CheckTarget(toRender,camera->cursorX,camera->cursorY);
 CDC *drawnActor = GetActorAnimationJob(toRender,wlvl);     
 RenderCharacter(dc,toRender->screenX,toRender->screenY,
                 10, drawnActor, isHighlight);
 DCDel(drawnActor);

 if(toRender->id!=mc->localPlayerId&&toRender->id<-STARTCLIENTS){

  U8 *nametag = "PLAYER 1";
  if(toRender->id==-10){
  }else{
  nametag = "PLAYER 2";//toRender->name;
  }
  dc->color = RED;
  PrintLine(dc,nametag,toRender->screenX+2,toRender->screenY-6,1);
 }
 //Free(toRender);
}

U0 SwitchRoofs(CDC *dc, Actor *p, I64 obj, I64 screenX, I64 screenY,
               I64 tileX, I64 tileY )
{
 I64 roofXSize =0;
 I64 roofYSize =0;
 switch(obj){
  case 0:
   break;
  start:
   roofXSize = 28;
   roofYSize = 12;
   case OBJ_CROOFNE:
    if(p->x<tileX)
     break;

    GrBlot3(dc,screenX-(42*roofXSize),screenY,0,ROOF001);
   break;
   case OBJ_CROOFNW:
    if(p->x>tileX&&p->y>tileY &&p->x<tileX+roofXSize&&p->y<tileY+roofYSize)
     break;

    GrBlot3(dc,screenX-(42*5),screenY,0,ROOF001);
   break;
   case OBJ_CROOFSW:
    if(p->x>tileX&&p->y<tileY)
     break;
    GrBlot3(dc,screenX-(42*5),screenY-(42*roofYSize),0,ROOF001);
   break;
   case OBJ_CROOFSE:
    if(p->x<tileX&&p->y<tileY)
     break;
    GrBlot3(dc,screenX-(42*roofXSize),screenY-(42*roofYSize),0,ROOF001);
   break;
  end:
  break;
  case OBJ_ROOF002:
   roofXSize = 8;roofYSize=8;
   if(p->x>tileX&&p->y>tileY&&p->x<tileX+roofXSize&&p->y<tileY+roofYSize)
    break;
   GrBlot3(dc,screenX+(42*roofXSize)+(42*2)-16,screenY+(42*(roofYSize-1)),0,ROOF002);
  break;
 }

}
   
U0 DrawRoofs(CDC *dc, Actor *p, I64 i, I64 j){
 I64 screenY = camera->dividY+camera->cameraOffSetY;
 I64 screenX = i*camera->dividX+camera->cameraOffSetX;

 for(j=0;j<wY;j++){
  screenY = (j*camera->dividY)-((p->y+5)*camera->dividY)+camera->cameraOffSetY;  
  for(i=0;i<wX;i++){ 
   screenX = (i*camera->dividX)-((p->x+5)*camera->dividX)+camera->cameraOffSetX;
    
   I64 obj= GetTensorObj(world->level,i,j,world->currentZ); 
     
   if(obj!=IT_NULL){
    SwitchRoofs(dc,p,obj,screenX,screenY,i,j);    
   }          
  }
 }

}



U0 DrawActorsAndItems(CDC *dc,Actor *p, I64 i, I64 j, I64 l)
{//draw npcs and items
 I64 screenY = camera->dividY+camera->cameraOffSetY;
 I64 screenX = i*camera->dividX+camera->cameraOffSetX;
 I64 tileX=0;
 I64 tileY=0;
 I64 RenderHLowerBound = -2;
 I64 RenderHUpperBound = 15;
 I64 RenderWLowerBound = -8;
 I64 RenderWUpperBound = 14;
 if(!weatherCells || weatherZ != world->currentZ)
  BuildWeatherModel();
 if(ShouldRefreshWeather())
  RefreshWeatherSystem();
 TrySpawnWeatherParticle(p,
    RenderWLowerBound, RenderWUpperBound,
    RenderHLowerBound, RenderHUpperBound);
 UpdateWeatherParticles();
 for(j=RenderHLowerBound;j<RenderHUpperBound;j++){
  if(camera->topUD+j<wY&&camera->topUD+j>=0){
   screenY = j*camera->dividY+camera->cameraOffSetY;
   tileY = camera->topUD+j;  
   for(i=RenderWLowerBound;i<RenderWUpperBound;i++){
    if(camera->topLR+i<wX&&camera->topLR+i>=0){
     tileX =  camera->topLR+i; 
     screenX = i*camera->dividX+camera->cameraOffSetX;
     I16 c =  GetTensor(world->level,camera->topLR+i,
                        camera->topUD+j,
                        world->currentZ);        
     I64 obj= GetTensorObj(world->level,
          tileX,tileY,world->currentZ);     
     I64 npc= GetTensorNPC(world->level,
          tileX,tileY,world->currentZ);     
     I64 wlvl= GetTensorWaterLevel(world->level,
          tileX,tileY,world->currentZ);     

     if(obj!=IT_NULL)
      DrawObjsOnLayer(dc,obj,screenX,screenY,p,tileX,tileY);
 
     DrawItemsOnLayer(dc,obj,i,j,l);
     if(npc!=IT_NULL)
      DrawActorsOnLayer(dc,npc,i,j,p,screenX,screenY,wlvl); 
     
    }//if too large x
   }//for x
   if(j<RenderHUpperBound-2)
    CheckAnimQueue(dc,screenY,tileY);//compute animations by row 
  }//if too large y
 }//for y

}


//
//activate retard mode
//
U0 DrawHealthMana(CDC *dc,Actor *p,I64 i, I64 j){
 //Current Spirit and Health 
 dc->color=BLUE;
 GrCircle(dc,518,344,36);
 I64 fillValue= ToI64((ToF64(p->currentMana)/ToF64(p->mana))*100);
 switch(fillValue){
  case 1...5:
   GrLine(dc,512,380,525,380);         
   //GrFloodFill(dc,521,381,TRUE);
   dc->color=BLACK;         
  break;
  case 6...10:
   GrLine(dc,508,378,530,378);         
   GrFloodFill(dc,519,379,TRUE);
   dc->color=BLACK;         
  break;
  case 11...15:
   GrLine(dc,499,375,534,375);         
   GrFloodFill(dc,521,378,TRUE);
   dc->color=BLACK;         
  break;
  case 16...20:
   GrLine(dc,495,373,540,373);//3         
   GrFloodFill(dc,521,378,TRUE);
   dc->color=BLACK;         
  break;
  case 21...25:
   GrLine(dc,490,370,542,370);//1         
   GrFloodFill(dc,521,378,TRUE); 
   dc->color=BLACK;        
  break;
  case 26...30:
   GrLine(dc,490,367,544,367);         
   GrFloodFill(dc,521,378,TRUE);
   dc->color=BLACK;         
  break;
  case 31...35: 
   GrLine(dc,488,365,546,365);        
   GrFloodFill(dc,521,378,TRUE);
   dc->color=BLACK;         
  break;
  case 36...40:
   GrLine(dc,485,363,546,363);         
   GrFloodFill(dc,521,378,TRUE);
   dc->color=BLACK;         
  break;
  case 41...45:
   GrLine(dc,480,355,550,355);         
   GrFloodFill(dc,521,378,TRUE);//12
   dc->color=BLACK;         
  break;
  case 46...50:
   GrLine(dc,480,350,553,350);    
   GrFloodFill(dc,521,378,TRUE);//11
   dc->color=BLACK;         
  break;
  case 51...55:
   GrLine(dc,480,347,553,347);         
   GrFloodFill(dc,521,378,TRUE);//10
   dc->color=WHITE;
  break;
  case 56...60:
   GrLine(dc,482,344,553,344);         
   GrFloodFill(dc,521,378,TRUE);//9
   dc->color=WHITE;
  break;
  case 61...65:
   GrLine(dc,483,340,552,340);
   GrFloodFill(dc,521,342,TRUE);//8
   dc->color=WHITE;
  break;
  case 66...70:
   GrLine(dc,484,335,552,335);
   GrFloodFill(dc,521,342,TRUE);//7
   dc->color=WHITE;
  break;
  case 71...75:
   GrLine(dc,484,330,550,330);
   GrFloodFill(dc,521,342,TRUE);//6
   dc->color=WHITE;
  break;
  case 76...80:
   GrLine(dc,486,325,547,325);
   GrFloodFill(dc,521,342,TRUE);//5 
   dc->color=WHITE;             
  break;
  case 81...85:
   GrLine(dc,490,320,543,320); 
   GrFloodFill(dc,521,342,TRUE); //4 
   dc->color=WHITE;
  break;
  case 86...90:
   GrLine(dc,495,315,538,315);
   GrFloodFill(dc,521,342,TRUE);//3 
   dc->color=WHITE;
  break;
  case 91...95:
   GrLine(dc,506,310,530,310);
   GrFloodFill(dc,521,342,TRUE);//2 
   dc->color=WHITE;
  break;
  case 96...1000:
   GrFloodFill(dc,521,342,TRUE);//1
   dc->color=WHITE;
  break;
 }

 U8 *t1 = MStrPrint("%d/%d",p->currentMana,p->mana);
 PrintLine(dc,t1,500,347,1);
 dc->color=RED;
 GrCircle(dc,597,344,36);   
 fillValue= ToI64((ToF64(p->currentHealth)/ToF64(p->health))*100);
 switch(fillValue){
  case 1...5:     
   GrLine(dc,586,377,610,377);
   GrFloodFill(dc,596,378,TRUE);      
   dc->color=BLACK;
  break;
  case 6...10:     
   GrLine(dc,582,375,616,375);
   GrFloodFill(dc,596,378,TRUE);      
   dc->color=BLACK;
  break;
  case 11...15:     
   GrLine(dc,575,373,619,373);
   GrFloodFill(dc,596,378,TRUE);      
   dc->color=BLACK;  
  break;
  case 16...20:
   GrLine(dc,573,370,621,370);
   GrFloodFill(dc,596,378,TRUE);      
   dc->color=BLACK;       
  break;
  case 21...25: 
   GrLine(dc,570,367,625,367);
   GrFloodFill(dc,596,378,TRUE);      
   dc->color=BLACK;      
  break;
  case 26...30:
   GrLine(dc,567,365,625,365);
   GrFloodFill(dc,596,378,TRUE);      
   dc->color=BLACK;  
  break;
  case 31...35:
   GrLine(dc,565,363,627,363);
   GrFloodFill(dc,596,378,TRUE);      
   dc->color=BLACK;  
  break;
  case 36...40:
   GrLine(dc,563,360,629,360);
   GrFloodFill(dc,610,362,TRUE);      
   dc->color=BLACK;  
  break;
  case 41...45:
   GrLine(dc,562,355,629,355);     
   GrFloodFill(dc,610,362,TRUE);      
   dc->color=BLACK;
  break;
  case 46...50:
   GrLine(dc,560,350,631,350);    
   GrFloodFill(dc,610,352,TRUE);      
   dc->color=BLACK;
  break;
  case 51...55:
   GrLine(dc,560,347,631,347);     
   GrFloodFill(dc,610,352,TRUE);      
   dc->color=WHITE;
  break;
  case 56...60:
   GrLine(dc,560,344,631,344);     
   GrFloodFill(dc,610,352,TRUE);      
   dc->color=WHITE;
  break;
  case 61...65:
   GrLine(dc,560,340,631,340);     
   GrFloodFill(dc,610,352,TRUE);      
   dc->color=WHITE;
  break;
  case 66...70:
   GrLine(dc,560,335,631,335);     
   GrFloodFill(dc,610,352,TRUE);      
   dc->color=WHITE;
  break;
  case 71...75:
   GrLine(dc,561,330,629,330);     
   GrFloodFill(dc,610,332,TRUE);      
   dc->color=WHITE;
  break;
  case 76...80:
   GrLine(dc,565,325,627,325);     
   GrFloodFill(dc,610,332,TRUE);      
   dc->color=WHITE;
  break;
  case 81...85:
   GrLine(dc,569,320,625,320);
   GrFloodFill(dc,610,332,TRUE);      
   dc->color=WHITE;          
  break;
  case 86...90:
   GrLine(dc,575,315,618,315);
   GrFloodFill(dc,610,332,TRUE);
   dc->color=WHITE;                
  break;
  case 91...95:
   GrLine(dc,585,310,606,310);
   GrFloodFill(dc,610,332,TRUE); 
   dc->color=WHITE;     
  break;
  case 96...1000:
   GrFloodFill(dc,610,332,TRUE); 
   dc->color=WHITE;    
  break;
 }
   
 t1 = MStrPrint("%d/%d",p->currentHealth,p->health);
 PrintLine(dc,t1,580,347,1);

}
