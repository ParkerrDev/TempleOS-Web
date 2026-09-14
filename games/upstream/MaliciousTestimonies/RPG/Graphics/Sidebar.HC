
//Main game side bar
U0 RPGSideBar(CDC *dc){
 dc->color = DKGRAY;
 GrRect(dc,12*camera->dividX-24,0,480,480);
 //GrRect3(dc,12*camera->dividX,0,0,1280,480);
 Sprite3B(dc,11*camera->dividX-25,-4,0,GetSideMenu);
 //save button 
 Sprite3B(dc,494,420,0,GetButton(4));
 //equipment button
 Sprite3B(dc,494,40,0,GetMenuSprite(MENU_MENUBOX));    
 Sprite3B(dc,510,52,0,GetMenuSprite(MENU_EQUIPMENT));
 //stats button
 Sprite3B(dc,554,40,0,GetMenuSprite(MENU_MENUBOX));    
 Sprite3B(dc,562,48,0,GetMenuSprite(MENU_STATS));
 //inventory button
 Sprite3B(dc,494,100,0,GetMenuSprite(MENU_MENUBOX));    
 Sprite3B(dc,510,112,0,GetMenuSprite(MENU_BAG));    
 //prayer button
 Sprite3B(dc,554,100,0,GetMenuSprite(MENU_MENUBOX));    
 Sprite3B(dc,564,112,0,GetMenuSprite(MENU_PRAYER));
 //run 
 Sprite3B(dc,494,160,0,GetMenuSprite(MENU_MENUBOX));
 if(mc->running){
  GrBlot3(dc,500,158,0,ITEM048);
  GrBlot3(dc,500,168,0,ITEM142);
 }else{
  GrBlot3(dc,500,163,0,ITEM048);
 } 
 //world
 Sprite3B(dc,554,160,0,GetMenuSprite(MENU_MENUBOX)); 
 Sprite3B(dc,554,162,0,GetMenuSprite(MENU_ORB));    
 //music button
 Sprite3B(dc,494,220,0,GetMenuSprite(MENU_MENUBOX));    
 Sprite3B(dc,493,222,0,GetMenuSprite(MENU_MUSIC));
 if(mc->musicMuted)   
  Sprite3B(dc,500,230,0,GetMenuSprite(MENU_MUTE));
 //fx button
 Sprite3B(dc,554,220,0,GetMenuSprite(MENU_MENUBOX));    
 Sprite3B(dc,546,230,0,GetMenuSprite(MENU_FX));
 if(mc->fxMuted)
  Sprite3B(dc,558,230,0,GetMenuSprite(MENU_MUTE));

}

U0 BlotPrayer(CDC *pm, I64 x, I64 y, I64 index){
 switch(prayers->list[index]->id){
  case SP_HEAL:
   GrBlot3(pm,x,y,0,ITEM050);
  break;
  default:
   Sprite3B(pm,x,y,0,GetQ());//unknown
  break;
 }
}
CDC *RenderPrayers(Actor *player){
 U8 *t0a = MStrPrint("%s%d","Available Points: ",prayers->points);
 U8 *t0b = "Total Unlocks:";
 U8 *t0c = MStrPrint("%d/%d",prayers->unlocked,MAX_PRAYERS);
 U8 *t0d = "Miracles |"; 
 U8 *t0e = "Wrath | ";
 U8 *t0f = "  Arts   | ";
 U8 *t0g = " Psalms|";

 CDC *pm = DCNew(150,300);
 DCFill(pm, BLACK);
 if(prayers->points>0){
  pm->color=RED;
  PrintLine(pm,t0a,0,22);
 }

 pm->color=WHITE;
 PrintLine(pm,t0b,0,36);
 PrintLine(pm,t0c,100,36);
 pm->color=YELLOW;
 PrintLine(pm,t0d,0,48);
 pm->color=RED;
 PrintLine(pm,t0e,75,48);
 pm->color=GREEN;
 PrintLine(pm,t0f,0,62);
 pm->color=LTBLUE;
 PrintLine(pm,t0g,68,62);
 
 Sprite3B(pm,0,80,10,GetLillestArrow(TRUE));
 Sprite3B(pm,94,80,10,GetLillestArrow(FALSE));

 Sprite3B(pm,0,100,0,GetMenuSprite(MENU_MENUBOX));    
 Sprite3B(pm,50,100,0,GetMenuSprite(MENU_MENUBOX));    
 Sprite3B(pm,100,100,0,GetMenuSprite(MENU_MENUBOX));    

 Sprite3B(pm,0,150,0,GetMenuSprite(MENU_MENUBOX));    
 Sprite3B(pm,50,150,0,GetMenuSprite(MENU_MENUBOX));    
 Sprite3B(pm,100,150,0,GetMenuSprite(MENU_MENUBOX));    

 Sprite3B(pm,0,200,0,GetMenuSprite(MENU_MENUBOX));    
 Sprite3B(pm,50,200,0,GetMenuSprite(MENU_MENUBOX));    
 Sprite3B(pm,100,200,0,GetMenuSprite(MENU_MENUBOX));    


 //list all prayers on this page
 I64 i,x=0,y=100;
 for(i=mc->prayerPage;i<MAX_PRAYERS;i++)
 {
  if(prayers->list[i]->type==prayers->filter)
  {
   BlotPrayer(pm,x,y,i);
  }
  x = x+50;
  if(x>101)
  { x= 0; y=y+50;
    if(y>201)
    { break; }
  }
 }

 Sprite3B(pm,120,0,1,
          GetMenuSprite(MENU_XBUTTON));//xbutton    

 return pm;
}


//stats menu bar

CDC *RenderStats(Actor *player)
{
  U8 *t0a = "Tribe of Judah";
  U8 *t0b = "Tribe of Levi";
  U8 *t0c = "Tribe of Ephraim";
  U8 *t0d = "Tribe of Benjamin";

  U8 *t1 = "STR:";
  U8 *t1a= "Base Attack Damage";
  U8 *v1 = MStrPrint("%d",player->str);
  U8 *t2= "CON:";
  U8 *t2a= "Base Attack Defense";
  U8 *v2 =  MStrPrint("%d",player->con);
  U8 *t3= "INT:";
  U8 *t3a="Special Attack Damage";
  U8 *v3 =  MStrPrint("%d",player->int);
  U8 *t4= "WIS:";
  U8 *t4a= "Special Attack Defense";
  U8 *v4 =  MStrPrint("%d",player->wis);

  U8 *t5= "Experience:";
  U8 *v5a= MStrPrint("%d",player->exp);
  U8 *v5b= MStrPrint("%d",player->maxExp);
  U8 *v5c= "/";
  U8 *t6= "Current Level:";
  U8 *v6= MStrPrint("%d",player->lvl);

  CDC *completeMenu = DCNew(140,300);
  DCFill(completeMenu, BLACK);

  completeMenu->color=WHITE;

  switch(player->tribe)
  {
    case T_JUDA:
     PrintLine(completeMenu,t0a,0,20);
    break;
    case T_LEVI:
     PrintLine(completeMenu,t0b,0,20);
    break;
    case T_EPHR:
     PrintLine(completeMenu,t0c,0,20);
    break;
    case T_BENJ:
     PrintLine(completeMenu,t0d,0,20);
    break;
  }
  PrintLine(completeMenu,t1,0,40);
  PrintLine(completeMenu,v1,4*7,40);
  PrintLine(completeMenu,t2,0,60);
  PrintLine(completeMenu,v2,4*7,60);
  PrintLine(completeMenu,t3,0,80);
  PrintLine(completeMenu,v3,4*7,80);
  PrintLine(completeMenu,t4,0,100);  
  PrintLine(completeMenu,v4,4*7,100);
  PrintLine(completeMenu,t5,0,120);  
  PrintLine(completeMenu,v5a,4*7,140);
  GrChar(completeMenu,v5c[0],5*7,140,1);
  PrintLine(completeMenu,v5b,7*7,140);  
  PrintLine(completeMenu,t6,0,160);
  PrintLine(completeMenu,v6,5*7,180);


 Sprite3B(completeMenu,120,0,1,
          GetMenuSprite(MENU_XBUTTON));//xbutton    
 return completeMenu;

}

