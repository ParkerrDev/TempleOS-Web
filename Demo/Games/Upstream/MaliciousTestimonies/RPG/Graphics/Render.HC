
CDC *GetActorAnimationJob(Actor *a,I64 wlvl){
 CDC *completeActor = DCNew(500,500);
 DCFill(completeActor, TRANSPARENT);

 switch(a->status1){
  case DYNG_STATUS:
  case DEAD_STATUS:
   DrawDead(completeActor,a);
   return completeActor;
  default:
  break;
 }
 switch(a->face){
   case T_JUDA...T_BENJ:
    completeActor = GetWalkAnimation(a,completeActor);
   break;
   case T_DOG:
    Sprite3B(completeActor,0,32,10,GetDog);
   break;
   case T_FOWL:
    Sprite3B(completeActor,0,32,10,GetFowl);
   break;
   case T_OX:
    Sprite3B(completeActor,0,32,10,GetOx);
   break;
   default:
    completeActor = GetWalkAnimation(a,completeActor);
   break;
 } 

 OverlayArmor(completeActor,a);
 //todo make status effects?
 if(wlvl>0)
 {
  a->screenY+=(wlvl+a->walking);
  completeActor->color = TRANSPARENT;
  GrRect3(completeActor,0,60,0,100,100);
 }
 return completeActor;

}



I64 GetActorScreenX(Actor *a, I64 npcox, I64 i, Bool Player=TRUE){
 if(Player){
  if(camera->topLR==0||camera->topLR==wX-11)
   npcox =GetWalkOffsetX(a->walking);
  a->screenX = i*camera->dividX-13+
                          npcox+camera->cameraOffSetX;
  return a->screenX;
 }else
 {
   npcox=GetWalkOffsetX(a->walking), 
   a->screenX = i*camera->dividX-13+npcox+(2*camera->cameraOffSetX);
  return a->screenX;
 }
}

I64 GetActorScreenY(Actor *a, I64 npcoy, I64 j,Bool Player=TRUE){
 if(Player){
  if(camera->topUD==0||camera->topUD==wY-11)
   npcoy =GetWalkOffsetY(a->walking);
  a->screenY = j*camera->dividY-42+
                          npcoy+camera->cameraOffSetY;
  return a->screenY;
 }else
 {
  npcoy=GetWalkOffsetY(a->walking);
  a->screenY = j*camera->dividY-42+npcoy+camera->cameraOffSetY;
  return a->screenY;
 }
}

Actor *GetActorAtMouse(I64 mx, I64 my){
 CombatTurn *ct = combatCQue.next;
 I64 index = 0;
 while(ct != &combatCQue){
  Actor *it = ct->ready;    
  if(it->visible){
   I64 ax = it->screenX;
   I64 ay = it->screenY;
   U8 *msg = MStrPrint("ACTOR:%d,%d - MOUSE:%d,%d",ax,ay,mx,my);
   // same offset used in HighlightTarget
   if(InRect(mx, my, ax, ay, ax+50, ay+70)){
    mc->targetCTPIndex = index;
    return it;
   }
  }

  ct = ct->next;
  index++;
 }

 return NULL;
}

U0 StartCameraPan(CDC *dc,Actor *p){
 // background world x pan
 if(camera->topLR==0||camera->topLR==wX-11){
  if(camera->cameraOffSetX!=0){
   if(camera->cameraOffSetX>0){
    camera->cameraOffSetX=Max(0,camera->cameraOffSetX-1);
   }
   else{
    camera->cameraOffSetX=Min(0,camera->cameraOffSetX+1); 
   }
  }
 }
 else if(camera->cameraMovedThisStep){
  camera->cameraOffSetX = -GetWalkOffsetX(p->walking);
 }
 else{
   camera->cameraOffSetX = 0;
 }
 //y pan
 if(camera->topUD==0||camera->topUD==wY-11){
  if(camera->cameraOffSetY!=0){
   if(camera->cameraOffSetY>0)
    camera->cameraOffSetY=Max(0,camera->cameraOffSetY-1);
   else
    camera->cameraOffSetY=Min(0,camera->cameraOffSetY+1);
  }
 }
 else if(camera->cameraMovedThisStep){
  camera->cameraOffSetY=-GetWalkOffsetY(p->walking);
 }
 else{
  camera->cameraOffSetY=0;
 }
}

U0 CombatQueInit(Actor **enemies,I64 count)
{
 CombatTurn *ctn;
 I64 i;

 mc->combatON = TRUE;
 mc->lootedSwitch = FALSE;
 mc->combatMenuStage = STAGE_0;
 mc->combatMenuSelection = CMS_MOVE;
 mc->turnIndex = 1;
 mc->currentSong = 5;
 mc->combatTurn=0;

 QueInit(&combatCQue);

 ctn = CAlloc(sizeof(CombatTurn));
 ctn->ready = GetPlayer();
 QueIns(ctn,combatCQue.last);

 for(i=0;i<count;i++){
  if(enemies[i]->status1==DEAD_STATUS)
   goto skipcount;

  ctn=CAlloc(sizeof(CombatTurn));
  ctn->ready=enemies[i];
  QueIns(ctn,combatCQue.last);

  AddDirective(BOUNCE,enemies[i]);
  skipcount:
 }

 ctp=combatCQue.next;
 targetCTP=combatCQue.next;
 CombatTurn *it = combatCQue.next;
 PrintDevMessage("=== Combat Queue Init ===",FALSE);

 i = 0;

 while(it != &combatCQue){
  PrintDevMessage(MStrPrint("QUEUE[%d] actor=%d name=%s",
  i,
  it->ready->id,
  it->ready->name
  ));

  it = it->next;
  i++;
 }
  it = it->next;

}


U0 RenderCharacter(CDC *dc,I64 iFinalX, I64 iFinalY,I64 iFinalZ,
           CDC *character,Bool highlight=FALSE)
{
 if(highlight){
  HighlightTarget(dc, iFinalX, iFinalY+24,iFinalZ+10);
 }
 GrBlot3(dc,iFinalX,iFinalY,iFinalZ,character);

}


U0 RenderMenus(CDC *dc, Actor *p)
{
 CDC *render;
   if(mc->displayDev){
    render = RenderDev();
    GrBlot3(dc,0,0,0,render); DCDel(render);
   }
   if(mc->displayStats){ 
    render = RenderStats(p); 
    GrBlot3(dc,12*camera->dividX-25,-4,0,render); DCDel(render);
   } else if(mc->displayPrayers){ 
    render = RenderPrayers(p); 
    GrBlot3(dc,12*camera->dividX-25,-4,0,render); DCDel(render);
   }

   if(mc->displayEquipment){
    render = RenderEquipment(p);
    GrBlot3(dc,10,10,0,render); DCDel(render);
   }
   if(mc->displaySave){
    render = RenderSaveForm();
    GrBlot3(dc,100,100,0,render); DCDel(render);
   }

}