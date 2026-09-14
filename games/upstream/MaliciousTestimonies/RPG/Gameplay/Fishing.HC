


U0 FishingHoleTrigger(Actor *p){
 SetActorDir(p,DIR_DOWN);
 switch(p->face){
  case T_JUDA:
   AddDirective(T1FISH,p);
  break;
  case T_LEVI:
   AddDirective(T2FISH,p);
  break;
  case T_EPHR:
   AddDirective(T3FISH,p);
  break;
  case T_BENJ:
   AddDirective(T4FISH,p);
  break;
 }

 AddDirective(EFFFISH,p,p->screenX-25,p->screenY+35);
 AddItemToInventory(p->myInv,IT_FISH1);
 
}