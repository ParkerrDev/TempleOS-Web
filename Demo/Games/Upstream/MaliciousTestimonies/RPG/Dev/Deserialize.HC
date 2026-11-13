//test

U0 PrintInventory(Inventory *myInv){
 U8 *str1 = MStrPrint("%d %d %d %d %d %d %d %d %d %d %d",
    myInv->mtrx[0][0].occupied, myInv->mtrx[0][1].occupied, myInv->mtrx[0][2].occupied,
    myInv->mtrx[0][3].occupied, myInv->mtrx[0][4].occupied, myInv->mtrx[0][5].occupied,
    myInv->mtrx[0][6].occupied, myInv->mtrx[0][7].occupied, myInv->mtrx[0][8].occupied,
    myInv->mtrx[0][9].occupied, myInv->mtrx[0][10].occupied);

 U8 *str2 = MStrPrint("%d %d %d %d %d %d %d %d %d %d %d",
    myInv->mtrx[1][0].occupied, myInv->mtrx[1][1].occupied, myInv->mtrx[1][2].occupied,
    myInv->mtrx[1][3].occupied, myInv->mtrx[1][4].occupied, myInv->mtrx[1][5].occupied,
    myInv->mtrx[1][6].occupied, myInv->mtrx[1][7].occupied, myInv->mtrx[1][8].occupied,
    myInv->mtrx[1][9].occupied, myInv->mtrx[1][10].occupied);

 U8 *str3 = MStrPrint("%d %d %d %d %d %d %d %d %d %d %d",
    myInv->mtrx[2][0].occupied, myInv->mtrx[2][1].occupied, myInv->mtrx[2][2].occupied,
    myInv->mtrx[2][3].occupied, myInv->mtrx[2][4].occupied, myInv->mtrx[2][5].occupied,
    myInv->mtrx[2][6].occupied, myInv->mtrx[2][7].occupied, myInv->mtrx[2][8].occupied,
    myInv->mtrx[2][9].occupied, myInv->mtrx[2][10].occupied);
 
 U8 *str4 = MStrPrint("%d %d %d %d %d %d %d %d %d %d %d",
    myInv->mtrx[3][0].occupied, myInv->mtrx[3][1].occupied, myInv->mtrx[3][2].occupied,
    myInv->mtrx[3][3].occupied, myInv->mtrx[3][4].occupied, myInv->mtrx[3][5].occupied,
    myInv->mtrx[3][6].occupied, myInv->mtrx[3][7].occupied, myInv->mtrx[3][8].occupied,
    myInv->mtrx[3][9].occupied, myInv->mtrx[3][10].occupied);


}


Bool HasItem(Inventory *myInv, I64 itemID)
{ 
 Item *toBeRetrieved = myInv->collection->next;
 I64 i;
 for(i=0;i<QueCnt(toBeRetrieved);i++){
  toBeRetrieved = toBeRetrieved->next;
  if(toBeRetrieved->id==itemID)
   return TRUE;
 }
 return FALSE;
}

U0 SetCoinValue(Inventory *myInv,I64 value)
{ 
 Item *toBeRetrieved = myInv->collection->next;
 I64 i;
 for(i=0;i<QueCnt(toBeRetrieved);i++){
  toBeRetrieved = toBeRetrieved->next;
  if(toBeRetrieved->id>=IT_SHEKEL&&toBeRetrieved->id<=IT_SHEKEL100)
   toBeRetrieved->value = value;
 }
}
#define W_NOTWALKING       0
#define W_LEFTSTRAIGHT     1
#define W_RIGHTSTRAIGHT    2
#define W_UPSTRAIGHT       3
#define W_DOWNSTRAIGHT     4
#define W_LEFTLEFT         5
#define W_RIGHTLEFT        6
#define W_UPLEFT           7
#define W_DOWNLEFT         8
#define W_LEFTMID          9
#define W_RIGHTMID         10
#define W_UPMID            11
#define W_DOWNMID          12
#define W_LEFTRIGHT        13
#define W_RIGHTRIGHT       14
#define W_UPRIGHT          15
#define W_DOWNRIGHT        16

//convert walk animation frame to cardinal direction
I64 GetDir(Actor *a){
 if(a->dir==DELIMITER){
  U8 walkDir = a->walking;
  U8 subWalk = a->walkingSubFrame;
  switch(walkDir){
   case W_NOTWALKING:
    switch(subWalk){
     case 0:
      return DIR_DOWN;
     break; 
     case 1:
      return DIR_UP;
     break;
     case 2:
      return DIR_RIGHT;
     break;
     case 3:
      return DIR_LEFT;
     break;
    }
   break;
   case W_UPSTRAIGHT   :
   case W_UPMID        :    
   case W_UPLEFT       :
   case W_UPRIGHT      :
    return DIR_UP;
   break;    
   case W_DOWNSTRAIGHT :
   case W_DOWNLEFT     :
   case W_DOWNRIGHT    :    
   case W_DOWNMID      : 
    return DIR_DOWN;   
   break;
   case W_LEFTLEFT     :
   case W_LEFTSTRAIGHT : 
   case W_LEFTMID      :
   case W_LEFTRIGHT    :
    return DIR_LEFT;    
   break;
   case W_RIGHTSTRAIGHT:
   case W_RIGHTLEFT    :
   case W_RIGHTMID     :   
   case W_RIGHTRIGHT   :
    return DIR_RIGHT;    
   break;
  }
  return DIR_DOWN;
 }else{
  return a->dir;
 }
}

U8 *SerializeActor(Actor *a)
{
 return MStrPrint(
  "JOIN\t%s\t%d\t%d\t%d\t%d\t%d\t%d\t%d\t%d\t%d\t%d",
  "Tribesman",
  a->id,
  a->tribe,
  a->hair,
  a->face,
  a->hat,
  a->armor,
  a->sword,
  a->ring1,
  a->x,
  a->y
 );
}

Actor *DeserializeNPC(I64 npcid)
{
 I64 i,j;
 U8 *fptr =FileRead(ACTOR_FILE);
 U8 *lnptr,*ln,*temp;
 StrUtil(fptr,SUF_REM_CTRL_CHARS);
 U8 name[15],*nameptr=name;
 U8 id[32],*idptr=id;
 U8 tribe[32],*tribeptr=tribe;
 U8 hair[8],*hairptr=hair;
 U8 face[8],*faceptr=face;
 U8 hat[8],*hatptr=hat;
 U8 armor[8],*armorptr=armor;
 U8 sword[8],*swordptr=sword;
 U8 ring1[8],*ring1ptr=ring1;
 U8 x[8],*xptr=x;
 U8 y[8],*yptr=y;
 U8 str[8],*strptr=str;
 U8 int[8],*intptr=int;
 U8 con[8],*conptr=con;
 U8 wis[8],*wisptr=wis;
 U8 ai[8],*aiptr=ai;
 U8 inv1[8],*inv1ptr=inv1;
 U8 inv2[8],*inv2ptr=inv2;
 U8 inv3[8],*inv3ptr=inv3;
 U8 inv4[8],*inv4ptr=inv4;
 U8 inv5[8],*inv5ptr=inv5;
 lnptr=fptr;
 Actor *p = NULL;
 I32 count = 0;
 while(ln=ReadALine(&lnptr))
 {
  if(count!=npcid||*ln=='#'||*ln==0)
   goto skip;
  StrScan(ln,"%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s",
   &nameptr,&idptr,&tribeptr,&hairptr,
   &faceptr,&hatptr,&armorptr,
   &swordptr,&ring1ptr,
   &xptr,&yptr,&strptr,
   &intptr,&conptr,&wisptr,&aiptr,&inv1ptr,
   &inv2ptr,&inv3ptr,&inv4ptr,&inv5ptr);
  p = 
   MakeActor(Str2I64(id),Str2I64(tribe),Str2I64(hair),Str2I64(face), 
             Str2I64(hat),Str2I64(armor), Str2I64(sword), Str2I64(ring1),
             Str2I64(x),Str2I64(y), 
             Str2I64(str),Str2I64(int),Str2I64(con),Str2I64(wis),Str2I64(ai)
            );  
  for(i=0;i<15;i++)
   p->name[i] = nameptr[i];//null term..?

  if(Str2I64(inv1)!=0){
   AddItemToInventory(p->myInv,Str2I64(inv1));
  }

  if(Str2I64(inv2)!=0)
   AddItemToInventory(p->myInv,Str2I64(inv2));

  if(Str2I64(inv3)!=0)
   AddItemToInventory(p->myInv,Str2I64(inv3));

  if(Str2I64(inv4)!=0)
   AddItemToInventory(p->myInv,Str2I64(inv4));

  if(Str2I64(inv5)!=0)
   AddItemToInventory(p->myInv,Str2I64(inv5));

  Free(fptr);
  return p;
  skip:;
  Free(ln);
  count++;
 }
 Free(fptr);

 

 return p;


}

U0 ReadNPC(I64 id){
 Actor *read = DeserializeNPC(id);
 QueIns(read, actors->last);
 return read;
}
U0 ReadNPC(I64 id)
{
 Actor *read = DeserializeNPC(id);

 if(read)
 {
  QueIns(read, actors->last);
 }

 return read;
}

Actor *GetNPC(I64 id)
{
 Actor *fetch = actors->next;

 while(fetch != actors)
 {
  if(fetch->id == id)
   return fetch;

  fetch = fetch->next;
 }

 if(id >= 0)
  return ReadNPC(id);

 return NULL;
}
