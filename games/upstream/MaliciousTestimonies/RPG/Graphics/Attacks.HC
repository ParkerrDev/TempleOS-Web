

I64 CalculateAngle(I64 x1 , I64 y1 , I64 x2 ,I64 y2)
{
  I64 dx = x2 -x1;
  I64 dy = y2-y1;
  if(dx ==0 && dy > 0){
    return 180;}
  else if( dx >0 &&dy ==0){
    return 90;}
  else if(dx == 0 && dy < 0){
   return 0;}
  else if(dx <0 && dy == 0){
   return 270;}
  else{ 
  return 90;}
}

I64 GetCTPIndexFromActor(Actor *a)
{
 Actor *it = combatCQue.next;
 I64 index = 0;

 while(it != &combatCQue){
  if(it->id == a->id){
   return index;
  }
  it = it->next;
  index++;
 }

 return -1; // not found (shouldnt happen)
}

Bool CheckTarget(Actor *toRender, I64 mouseX, I64 mouseY)
{
 Bool highlight = FALSE;
 if(!toRender)
  return FALSE;

 if(mc->combatMenuSelection != CS_STRIKE &&
    mc->combatMenuSelection != CS_PRAYER2)
  return FALSE;

 // --- MOUSE MODE (visual only, no state mutation) ---
 if(mc->mouseTargetingActive){
  if(InRect(mouseX, mouseY,
            toRender->screenX,
            toRender->screenY + 50,
            toRender->screenX + 50,
            toRender->screenY + 90))
  {
   return TRUE;
  }

  return FALSE;
 }

 // --- KEYBOARD MODE (authoritative) ---
 if(targetCTP && targetCTP->ready){
  if(toRender->id == targetCTP->ready->id){
   highlight = TRUE;
   Actor *p = GetPlayer;
   p->target = toRender;
  }
 }

 return highlight;
}

//called after combatMenuSelection==11
U0 HighlightTarget(CDC *dc, I64 hX, I64 hY,I64 hZ)
{
 dc->color=RED;
 dc->thick=3;
    //GrRect3(dc,hX+25,hY+45,0,50,50);
 GrCircle3(dc,hX+25,hY+45,0,15);
    //GrFloodFill(dc,hX+13,hY+13,TRUE);   
 dc->thick = 1;   
}

U0 PlayStrikeAnim(Actor *p){
 I64 anim = T1PUNCH;
 I64 i;
 for(i = 0;i<STRIKETYPES;++i) {
  if(StrikeAnimMap[i].face  == p->face &&
     StrikeAnimMap[i].sword == p->sword) {
   anim = StrikeAnimMap[i].anim;
   break;
  }
 }

 AddDirective(anim,p); 
}
