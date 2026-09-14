
#define NoDirective -1

class Animation:CQue{
 CDC *frame;
 I8 frameDuration,//how many times to show 
    frameDurationIndex,
    xOffset, yOffset, xAOff, yAOff;
 I64 key;
 I8 frameIndex;//frame pos in anim
} allAnimations;

class Director:CQue{
 I64 cQueDirective;
 I32 animIndex;//cur pos in anim
 I64 x, y, z, xAOff, yAOff,tileX,tileY; 
 //x/y/z to render; 
 //x/y armor frame Offset; 
 //hometile X/Y
 Bool flip, isEffect;
 Actor *a;
} direct;

U0 ResetDirective(Director *task){
 task->cQueDirective = NoDirective;
 task->animIndex = 0;
 task->x = 999;
 task->y = 999;
 task->z = 0;
 task->flip = FALSE;
 task->xAOff = 0;
 task->yAOff = 0;
 SetActorDir(task->a,DIR_DOWN);//end prayer

}

U0 FreeTask(Director *task){
 QueRem(task);
 Free(task);
}

Director *HasAnyDirective(Actor *a){
 Director *task = direct.next;
 I64 i =0; Bool free=TRUE;
 for(i=0;i!=QueCnt(direct);i++){
  if(task->a->id==a->id&&task->cQueDirective!=NoDirective){
   free = FALSE;
   break;
  }
  task = task->next;
 }
 if(free)
  return NULL;
 return task;
}

