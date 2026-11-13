#define SPR_L1  0
#define SPR_L2  1
#define SPR_L3  2
#define SPR_R1  3
#define SPR_R2  4
#define SPR_R3  5
#define SPR_U1  6
#define SPR_U2  7
#define SPR_U3  8
#define SPR_D1  9
#define SPR_D2 10
#define SPR_D3 11 
#define SPR_MAX 12
#define WALK_MAX 17

class WalkMap{
 I64 wsf; //walk subframe
 I64 wf; //walk frame
 U8 spriteIndex;
};

static WalkMap walkMapEntry[WALK_MAX] = {
 { 0, 0, SPR_D2 }
 { 0, 5,  SPR_L1 },
 { 0, 6,  SPR_R1 },
 { 0, 7,  SPR_U1 },
 { 0, 8,  SPR_D1 },
 { 0, 9, SPR_L2 },
 { 0, 10, SPR_R2 },
 { 0, 11, SPR_U2 },
 { 0, 12, SPR_D2 },
 { 0, 13, SPR_L3 },
 { 0, 14, SPR_R3 },
 { 0, 15, SPR_U3 },
 { 0, 16, SPR_D3 },
 { 3, 0, SPR_L2 },
 { 2, 0, SPR_R2 },
 { 1, 0, SPR_U2 },
 { 0, 0, SPR_D2 }
};


static U8 idleSpriteKey[4] = {
 SPR_D2,
 SPR_U2,
 SPR_R2,
 SPR_L2,
};


U0 SetActorSubFrameRule(Actor *a,I64 wsf,I64 w ){
 a->walkingSubFrame++;
 if(mc->running&&a->currentMana>0){
  a->walkingSubFrame++;
 }else{
  if(a->id==mc->localPlayerId)
   mc->running = FALSE;
 }
 if(a->walkingSubFrame>= FRAMERULE){
  a->walkingSubFrame=wsf;       
  a->walking = w;
 }

}

//xOffset to correct for .WAD graphics being slightly off origin 
CDC *HandleWalkSubFrame(Actor *a, CDC *completeActor,
                        CDC *L1, CDC *L2, CDC *L3,
                        CDC *R1, CDC *R2, CDC *R3,
                        CDC *U1, CDC *U2, CDC *U3,
                        CDC *D1, CDC *D2, CDC *D3, 
                        I64 xOffset=0){
 U8 walkDir = a->walking;
 U8 subWalk = a->walkingSubFrame;

 CDC *sprites[SPR_MAX];
    sprites[SPR_L1] = L1;
    sprites[SPR_L2] = L2;
    sprites[SPR_L3] = L3;

    sprites[SPR_R1] = R1;
    sprites[SPR_R2] = R2;
    sprites[SPR_R3] = R3;

    sprites[SPR_U1] = U1;
    sprites[SPR_U2] = U2;
    sprites[SPR_U3] = U3;

    sprites[SPR_D1] = D1;
    sprites[SPR_D2] = D2;
    sprites[SPR_D3] = D3;

 if(walkDir == DIR_IDLE) {
  U8 sprite = idleSpriteKey[subWalk];
  if(a->visible)
   GrBlot3(completeActor, xOffset, 0, 10, sprites[sprite]);
  return completeActor;
 }

 WalkMap *m = &walkMapEntry[walkDir];

 if(a->visible)
  GrBlot3(completeActor, xOffset, 0, 10, sprites[m->spriteIndex]);

 return completeActor;
}

CDC *GetWalkAnimation(Actor *a, CDC *completeActor){
 switch(a->face){
  case T_JUDA://Judah
   completeActor = HandleWalkSubFrame(a, 
                    completeActor,
                    A1L1, A1L2, A1L3,
                    A1R1, A1R2, A1R3,
                    A1U1, A1U2, A1U3,
                    A1D1, A1D2, A1D3);
  break;
  case T_LEVI://Levi
   completeActor = HandleWalkSubFrame(a, 
                    completeActor,
                    A2L1, A2L2, A2L3,
                    A2R1, A2R2, A2R3,
                    A2U1, A2U2, A2U3,
                    A2D1, A2D2, A2D3, -2);
  break;
  case T_EPHR://Ephraim
   completeActor = HandleWalkSubFrame(a, 
                    completeActor,
                    A3L1, A3L2, A3L3,
                    A3R1, A3R2, A3R3,
                    A3U1, A3U2, A3U3,
                    A3D1, A3D2, A3D3, -4);
  break;
  case T_BENJ://Benjamin
   completeActor = HandleWalkSubFrame(a, 
                    completeActor,
                    A4L1, A4L2, A4L3,
                    A4R1, A4R2, A4R3,
                    A4U1, A4U2, A4U3,
                    A4D1, A4D2, A4D3, -6);
  break;
 }
 return completeActor; 
}

Bool HasDirective(I64 directive,Actor *a,
                  I64 tX=DELIMITER, I64 tY=DELIMITER){
 Director *task = direct.next;
 I64 i =0; Bool free=FALSE;
 for(i=0;i!=QueCnt(direct);i++){
  if(task->cQueDirective==directive){
   if(task->a->id==a->id&&
     ((task->tileX==tX&&task->tileY==tY)||tX==DELIMITER)){
    free = TRUE;
    break;
   }
  }
  task = task->next;
 }
 return free;
}

Director *FindDirective(Actor *a){
 Director *task = direct.next;
 I64 i =0; Bool free=FALSE;
 for(i=0;i!=QueCnt(direct);i++){
  if(task->a->id==a->id){
   if(task->a->id==a->id&&!(task->isEffect))
    return task;
  }
  task = task->next;
 }
 return NULL;
}
//update directive id by paramaters actor and directive
//inherently checks Has
//paramaeters screen x y z to be updated
//explicitRemoval takes it out of director queue
Bool UpdateDirective(I64 directive,Actor *p,
                     I64 x, I64 y, I64 z,Bool explicitRemoval=FALSE,
                     I64 tX=DELIMITER,I64 tY=DELIMITER){
 Director *task = direct.next;
 I64 i =0; Bool free=FALSE;
 for(i=0;i!=QueCnt(direct);i++){
  if(task->cQueDirective==directive){
   if(task->a->id==p->id&&
     ((task->tileX==tX&&task->tileY==tY)||tX==DELIMITER)){
    if(p->status1==DEAD_STATUS||p->status1==DYNG_STATUS||explicitRemoval){ //update if actor dies mid animate
     ResetDirective(task);
     return FALSE;
    }
    task->x = x; task->y = y; task->z = z;
    free = TRUE;
   }
  }
  task = task->next;
 }
 return free; 
}

Director *InitDirective(Actor *p, I64 sX, I64 sY,I64 tX, I64 tY){
 
 Director *task = MAlloc(sizeof(Director));

 task->xAOff = 0;//=screenX (no offset by default)
 task->yAOff = 0;//=screenY
 if(tX!=DELIMITER){task->tileX = tX; task->tileY = tY;}else{
  task->tileX = DELIMITER;task->tileY = DELIMITER;
 }
 if(sX!=DELIMITER){task->x = sX; task->y = sY;}else{
  task->x = p->screenX;task->y = p->screenY;}

 task->a = p;
 task->animIndex = 0;
 task->flip = FALSE;
 task->isEffect = FALSE;
 return task;
}

//sX,sY optional; use p for x and y by default
U0 AddDirective(I64 directive, Actor *p,//npc must own animation
                I64 sX=DELIMITER,I64 sY=DELIMITER,
                I64 tX=DELIMITER,I64 tY=DELIMITER){
 Director *task = InitDirective(p,sX,sY,tX,tY);
 Bool isEffect = FALSE;

 task->cQueDirective = directive;
 switch(directive){
  case T1PUNCH...T4PUNCH:
  case T1STAB...T4STAB:
  case T1SLASH...T4SLASH:
  case T1SLEEP...T4SLEEP:
  task->cQueDirective = directive;
  Actor *pT = p->target;
  if(pT==NULL){
   SetActorDir(p,DIR_LEFT);
  }else{
   if(p->x<=p->target->x){
    task->flip = TRUE;
    SetActorDir(p,DIR_RIGHT);
   }else{
    SetActorDir(p,DIR_LEFT);
   }
  }
  break;
  case T1EFFHEAL:
  case EFFFISH:
  case EFFSLEEP:
  case EFFFIRE:
  case EFFCLICK:
  case EFFSCRATCH:
  case EFFBANNER:
   task->cQueDirective = directive;
   isEffect = TRUE;
   task->isEffect = isEffect;
  break;
  //default://dont enable this i know you want to
  // task->cQueDirective = directive;
  //break;

 }
 QueIns(task,direct.last);
 if(!isEffect) 
  p->visible=FALSE;

}

Bool DeathAnimationFinished(Actor *a){
 Director *task = FindDirective(a);

 if(task == NULL)
  return FALSE;

 switch(task->cQueDirective){
  case T1DIE:
  case T2DIE:
  case T3DIE:
  case T4DIE:
   if(task->animIndex >= 7)
    return TRUE;
  break;
 }

 return FALSE;
}