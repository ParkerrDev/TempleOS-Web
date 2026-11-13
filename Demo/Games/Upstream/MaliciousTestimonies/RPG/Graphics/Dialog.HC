#define MAX_D 120
U8 *DIALOG_FILE = MStrPrint("%s%s",DirCur,"/Data/Dialog.TXT"); 
U8 *MARKOV_FILE = MStrPrint("%s%s",DirCur,"/Gameplay/Markov/Data.DD"); 
U8 *MARKOV_FILE2 = MStrPrint("%s%s",DirCur,"/Gameplay/Markov/Druid.DD"); 
U8 *MARKOV_FILE3 = MStrPrint("%s%s",DirCur,"/Gameplay/Markov/Guest.DD"); 

I32 currLetter =-1,yInc=0,xInc=0,nIndex=0,n2Index=0;
U8 myDialog[MAX_D];

#define GENERATED_TEXT 19
#define DRUID_TEXT 20
#define GUEST_TEXT -2

U0 DeserializeDialog(I64 textID){
 U8 *nameptr=myDialog;
  //id for sorting purpose only
  U8 id[8],*idptr=id;

 if((textID>=GENERATED_TEXT&&textID<=21)||textID<GUEST_TEXT)//generated text
 {
  U8 *startWord="The",*file = MARKOV_FILE;
  U16 r = RandU16();
  // 80% chance-returns a number from 0 to 65535 (inclusive).
  // 80% of 65536 = 52428.8, so comparing like this
  if (r < 0.40 * 65536) {
    startWord = "The";
  }
  else if (r < 0.70 * 65536) {
     startWord = "I";
  }
  else if (r < 0.85 * 65536) {
     startWord = "You";
  }
  else if (r < 0.93 * 65536) {
     startWord = "Do";
  }
  else if (r < 0.98 * 65536) {
     startWord = "That";
  }
  else {
     startWord = "And";
  }
  switch(textID)
  {
   case DRUID_TEXT:
   file =MARKOV_FILE2; 
   break;
   case -39...GUEST_TEXT:
   file =MARKOV_FILE3; 
   break;
   default:
   file =MARKOV_FILE; 
   break;  
  }  
  U8 *speech2 = MarkovGenerate(DocPut,file,25,startWord); 
  U8 *speech = MStrPrint("%s%s.",startWord,speech2); 
  I64 dialogLen = 0; 
  I64 strLen = StrLen(speech);
  for(dialogLen=0;dialogLen<strLen;dialogLen++){
   if(dialogLen<MAX_D-1)
   {
    myDialog[dialogLen] = speech[dialogLen];
   }
  }
  myDialog[dialogLen] = '\0'; 
  Free(speech);
 
 }else{
 
  U8 *fptr =FileRead(DIALOG_FILE);
  U8 *lnptr,*ln,*temp;
  StrUtil(fptr,SUF_REM_CTRL_CHARS);
  lnptr=fptr; 

  I32 count = 0;
  while(ln=ReadALine(&lnptr))
  {
   //"%s",ln;
   if(count!=textID||*ln=='#'||*ln==0)
    goto skip;
   StrScan(ln,"%s\t%s",&idptr,&nameptr);
   break;
   skip:;
   Free(ln);
   count++;
  }
  Free(fptr);
 }
}


//textID = dialog from Dialog.TXT
U0 GetDialogMsg(U8 textID)
{
  if(currLetter==0)
   DeserializeDialog(textID);
}


I64 GetTalkie(I64 id){
 I64 talkie =0;
 switch(id){
  case SV_KING_1://king
   talkie = 10;
  break;
  case SV_JEZ_1://jezebel
   talkie = 9;
  break;
  case SV_ELI_1://elijah
   talkie = 11;
  break;
  case SV_GUARD1://guard
   talkie = 2;
  break;
  case SV_GUARD2://captain
   talkie = 3;
  break;
  case SV_WOLF1://wolf
  case 9:
  case 11...20:
   talkie = 12;
  break;
  case SV_MISS_FISH_EQUIP://missing fish equip
   talkie = 15;
  break;
  case SV_COW://ox
   talkie = 17;
  break;
  case SV_FOWL://fowl
   talkie = 18;
  break;
  case SV_SHAMIR://shop
   talkie = SV_SHAMIR_SHOP;
  break;
  case SV_GENERIC_START...SV_PARTIER:
    talkie=GUEST_TEXT-id;//-2-37
  break;
  case SV_BARZEL://shop
   talkie = SV_BARZEL_SHOP;
  break;
  case SV_U8_DRUID:
   talkie=DRUID_TEXT;
  break; 
  default:
   talkie=GENERATED_TEXT;
  break; 
 }
 return talkie;
}

U0 ClearDialog()
{
 I64 i;
 mc->talkieScene = IT_NULL;
 currLetter =-1;yInc=0;xInc=0;nIndex=0;n2Index=0;
 for(i=0;i<MAX_D;i++)
  myDialog[i] = '';
}


Bool MerchantList(I64 textID)
{
 if(textID==SV_SHAMIR_SHOP||textID==SV_BARZEL_SHOP)
 {
  return TRUE;
 }
 return FALSE;
}

U0 MerchantMenu(CDC *dc, I64 selection){
 Sprite3B(dc,150,DIALOG_BOX_Y-52,0,GetDialogBox(2));
 PrintLine(dc,"Trade",158,DIALOG_BOX_Y-42,2);
 PrintLine(dc,"Leave",158,DIALOG_BOX_Y-20,2);

 switch(selection)
 {
  case 0:
   Sprite3B(dc,238,DIALOG_BOX_Y-42,0,GetCross);
  break;
  case 1:
   Sprite3B(dc,238,DIALOG_BOX_Y-20,0,GetCross);
  break; 
 }

}

//name = Name of the NPC ==mc->dialogName
//dc = current device context
//task = current ctask
//textID = mc->talkieScene = Dialog.TXT
U0 Chatbox(U8 *name, CDC *dc, CTask *task,U8 textID)
{
 I64 i,xInc=3,yInc=0;
 U8 c;
 switch(textID){
    case -28:
     GrBlot3(dc,286,180,0,P4S);//bridesmaid
    break;
    case -29:
     GrBlot3(dc,286,180,0,P6S);//groomsman
    break;   
    case -30:
     GrBlot3(dc,286,180,0,P15S);//crybaby
    break;    
    case -31:
     GrBlot3(dc,286,180,0,P12S);//ethbaal
    break;    
    case -32:
     GrBlot3(dc,286,180,0,P11S);//drunk
    break;    
    case -33:
     GrBlot3(dc,286,180,0,P13S);//fat man
    break;    
    case -34:
     GrBlot3(dc,286,180,0,P14S);//fancy lady
    break;    
    case -35:
     GrBlot3(dc,286,180,0,P16S);//smug guy
    break;    
    case -36:
     GrBlot3(dc,286,180,0,P7S);//dirty
    break;    
    case -37:
     GrBlot3(dc,286,180,0,P6S);//sweaty
    break;    
    case -38:
     GrBlot3(dc,286,180,0,P17S);//not used
    break;
    case -39:
     GrBlot3(dc,286,180,0,P13S);//fat man
    break;
  case 2:
   GrBlot3(dc,286,180,0,P10S);//guard
  break;
  case 3:
   GrBlot3(dc,286,180,0,P9S);//captain
  break;
  case 9:
   GrBlot3(dc,286,180,0,P1S);//jez
  break;
  case 10:
   GrBlot3(dc,286,180,0,P2S);//ahab
  break;
  case 11:
   GrBlot3(dc,276,180,0,P3S);//eli
  break;
  case SV_SHAMIR_SHOP:
   GrBlot3(dc,276,180,0,P5S);//shamir
  break;
  case SV_BARZEL_SHOP:
   GrBlot3(dc,276,180,0,P18S);//barzel
  break;
  case DRUID_TEXT:
   GrBlot3(dc,276,180,0,P17S);//pious
  break;
 }
 dc->color=WHITE;
 I64 width = 25+StrLen(name)*12;
 GrRect(dc,24,355,width,50);
 dc->color=BLACK;
 Sprite3B(dc,3,375,0,GetDialogBox);
 if(currLetter<MAX_D)
   currLetter++;

 if(MerchantList(textID))
  MerchantMenu(dc,mc->dialogSelection);
 
 
 GetDialogMsg(textID);

 for(i=0;i<currLetter;i++){
  c = myDialog[i];
  if(c=='#'){
   c = myDialog[++i];
   yInc+=16;
   xInc=3;
  }
  GrChar(dc,c,6+xInc,386+yInc,2);
  xInc+=14;   
 }
 PrintLine(dc,name,26,360,2);


}

//select combat action
U0 CombatDialog1(CDC *dc, CTask *task, U8 selection)
{
 U8 *cOption1 = "Move";
 U8 *cOption2 = "Strike";
 U8 *cOption3 = "Prayer";
 U8 *cOption4 = "Flee";

 U8 c,i;
 dc->color=BLACK;
 
 switch(selection)
 {
  case 10: break;
  case 11: break;
  case 12: break;
  case 13: break;
  start:
   Sprite3B(dc,0,DIALOG_BOX_Y,0,GetDialogBox);
   case CMS_MOVE:
   Sprite3B(dc,46+5*13,395,0,GetCross);
   break;
   case CMS_STRIKE:
   Sprite3B(dc,280+7*13,395,0,GetCross);
   break;
   case CMS_PRAYER:
   Sprite3B(dc,46+7*13,435,0,GetCross);
   break;
   case CMS_FLEE:
   Sprite3B(dc,280+5*13,435,0,GetCross);
   break;
  end:
   PrintLine(dc,cOption1,46,395,2);
   PrintLine(dc,cOption2,280,395,2);
   PrintLine(dc,cOption3,46,435,2);
   PrintLine(dc,cOption4,280,435,2);

  break;  

 }
}

//select prayer/item
U0 CombatDialog2(CDC *dc, CTask *task)
{
 Sprite3B(dc,300,250,0,GetButton(5));
 I64 i,j,x=280,y=250;
 mc->prayerToCast = mc->prayerList[mc->prayerListIndex];

 mc->isItemSelector=FALSE;
 for(i=0;i<mc->prayerListSize;i++){
  if(mc->prayerList[i]==mc->prayerToCast){
   //delimiter indicates player selected back button
   if(mc->prayerToCast==DELIMITER){
    Sprite3B(dc,x,y,0,GetCross);
    goto found;
   }
   if(mc->isItemSelector){
     GetItemScreenLoc(mc->prayerToCast,&x,&y);
     Sprite3B(dc,x,y,0,GetCross);
     goto found;
   }
   else
   {//player selecting prayer from hotbar
    if(!mc->isItemSelector){
     for(j=0;j<NUM_HOTKEYS;j++)
     {
      if(hotkeys[j]==mc->prayerToCast){
       x = 10+(50*j);
       y = 26;
       Sprite3B(dc,x,y,0,GetCross);
       goto found;
      }
     }      
    }
   }
  }
  else
  {//if we have passed delimiter, then we enter the inventory space
   if(mc->prayerList[i]==DELIMITER)
    mc->isItemSelector=TRUE;
  }  
 }
 found:
}

//Flee box
U0 CombatDialog3(CDC *dc, CTask *task){
 U8 *fleeText = "Attempting to run away!";
 dc->color = BLACK;
 Sprite3B(dc,0,DIALOG_BOX_Y,0,GetDialogBox);
 PrintLine(dc,fleeText,12,385,2);

}

//Enemy attack     
U0 CombatDialog4(CDC *dc, CTask *task, Actor *p){
 U8 *prefix = "star";
 switch(ctp->ready->status1){
  case DYNG_STATUS:
   prefix = "dy";
  break;
  default:
   prefix = "attack";
  break;
 }
 U8 *action = MStrPrint(" is %sing!",prefix);
 U8 *eText = MStrPrint("%s%s",ctp->ready->name,action);
 dc->color = BLACK;
 Sprite3B(dc,0,DIALOG_BOX_Y,0,GetDialogBox);
 PrintLine(dc,eText,12,385,2);
 Free(action);
 Free(eText);

}
U0 CombatDialog5(CDC *dc, CTask *task, Actor *p)
{
 U8 *eText;
 Bool freeText = FALSE;
 CombatTurn *nextTurn;

 if(!HasLivingEnemies())
 {
  eText = "You are victorious!";
 }
 else
 {
  nextTurn = ctp->next;

  if(nextTurn == &combatCQue)
   nextTurn = combatCQue.next;

  if(nextTurn->ready->id == mc->localPlayerId)
  {
   eText = "Your turn!";
  }
  else
  {
   eText = MStrPrint(
    "%s's turn!",
    nextTurn->ready->name
   );
   freeText = TRUE;
  }
 }

 dc->color = BLACK;
 Sprite3B(dc,0,DIALOG_BOX_Y,0,GetDialogBox);
 PrintLine(dc,eText,12,385,2);

 if(freeText)
  Free(eText);
}

U0 CombatDialog5old(CDC *dc, CTask *task, Actor *p){
 U8 *eText;
 Bool freeText = FALSE;
 if(!HasLivingEnemies())
  eText = "You are victorious!";
 else
 {
  if(ctp->ready->id==p->id){
   eText = "Your turn!";
  }
  else{
   CombatTurn *ctpL = ctp->last;
   eText = MStrPrint("%s's turn!", ctpL->ready->name);
   freeText = TRUE;
  }
 }

 dc->color = BLACK;
 Sprite3B(dc,0,DIALOG_BOX_Y,0,GetDialogBox);
 PrintLine(dc,eText,12,385,2);

 if(freeText)
  Free(eText);
}
