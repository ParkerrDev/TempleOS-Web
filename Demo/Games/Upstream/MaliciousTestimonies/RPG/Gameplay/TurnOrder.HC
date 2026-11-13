
#define FACENUM       4
#define STRIKETYPES   (FACENUM*WEAPONCOUNT) 

//Attack map
static class StrikeAnims{
    I64 face;
    I64 sword;
    I64 anim;
} StrikeAnimMap [STRIKETYPES] = {
     // Judah
    { T_JUDA, IT_FIST,   T1PUNCH },
    { T_JUDA, IT_DAGGER, T1STAB  },
    { T_JUDA, IT_HARPOON,T1STAB },
    { T_JUDA, IT_BRZSWORD,T1STAB },
    { T_JUDA, IT_HAMMER,T1SLASH },
    { T_JUDA, IT_HATCHET,T1SLASH },

    // Levi
    { T_LEVI, IT_FIST,   T2PUNCH },
    { T_LEVI, IT_DAGGER, T2STAB  },
    { T_LEVI, IT_HARPOON,T2STAB },
    { T_LEVI, IT_BRZSWORD,T2STAB },
    { T_LEVI, IT_HAMMER,T2SLASH },
    { T_LEVI, IT_HATCHET,T2SLASH },

    // Ephr
    { T_EPHR, IT_FIST,   T3PUNCH },
    { T_EPHR, IT_DAGGER, T3STAB  },
    { T_EPHR, IT_HARPOON,T3STAB },
    { T_EPHR, IT_BRZSWORD,T3STAB },
    { T_EPHR, IT_HAMMER,T3SLASH },
    { T_EPHR, IT_HATCHET,T3SLASH },

    // Benj
    { T_BENJ, IT_FIST,   T4PUNCH },
    { T_BENJ, IT_DAGGER, T4STAB  },
    { T_BENJ, IT_HARPOON,T4STAB },
    { T_BENJ, IT_BRZSWORD,T4STAB },
    { T_BENJ, IT_HAMMER,T4SLASH },
    { T_BENJ, IT_HATCHET,T4SLASH },
};

U0 CTPProgress()
{
 mc->combatTurn++;
 I64 count = QueCnt(combatCQue);
 I64 i;
 if(mc->combatTurn == count)
  mc->combatTurn = 0;

 ctp = combatCQue.next;

 for(i = 0; i < count; i++){
  if(i == mc->combatTurn)
   break;

  ctp = ctp->next;
 }
}

U0 SetCombatStage1()
{
 mc->turnIndex = 1;
 mc->combatMenuStage = STAGE_1;
 mc->combatMenuSelection = CMS_ENE1;
}


Bool HasLivingEnemies(){
 return QueCnt(combatCQue) > 1;
}


U0 RemoveDeadCombatants(){
 CombatTurn *cur = combatCQue.next;
 I64 count = QueCnt(combatCQue);
 I64 i;
 for(i = 0; i < count; i++) {
  CombatTurn *next = cur->next;
  if(cur->ready->status1==DYNG_STATUS|| cur->ready->status1 == DEAD_STATUS){
   if(cur == ctp){
    ctp = next;
    if(ctp == &combatCQue)
     ctp = combatCQue.next;
   }
   QueRem(cur);
   Free(cur);
  }
  cur = next;
 }
}