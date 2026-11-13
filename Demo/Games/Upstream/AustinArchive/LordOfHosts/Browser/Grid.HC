//Austin Sierra
//John Bilgin 
//Clayton Rhodes
//Church of AIChrist
//Ludum Dare 53
//Cd(__DIR__);;
#include "Matrix.HC";
#include "Rock.HC";
#include "Tree.HC";
#include "Jew.HC";
#include "Cactus.HC";
#include "Drone.HC";
#include "JC.HC";
#include "Pizza.HC";
#include "Skateboard.HC";


#define SCREENX 640
#define SCREENY 480
#define RAMP_WIDTH 600
#define LEVELS 99
#define TRACKLEN1 99
#define TRACKLEN2 999
#define TRACKLEN3 9999

#define PLAYER_ACCEL 2
#define PLAYER_MIN_Y (GR_HEIGHT-300)
#define PLAYER_MAX_Y (GR_HEIGHT)

I64 ft=0,bt=0;
Matrix *world;
Matrix *forwardTrack;
Matrix *backwardTrack;

#define PLAYER_ACCEL 3
#define PLAYER_MIN_Y (GR_HEIGHT-300)
#define PLAYER_MAX_Y (GR_HEIGHT)
class JPlayer
{
I64 usr_xx,usr_yy,usr_dir;
I64 curLvl,tilesPassed;
I64 time,score; 
F64 forward_angle;
F64 velo;
F64 jump_start_ts;
F64 hit_start_ts;
F64 score_start_ts;
I64 spin_to_x,spin_to_y;
I64 zaLeft;
Bool metJew;
Bool deliver;
};

class Drone
{
I64 y,mv;
};

class Keys
{
 Bool space,left,right,up,down;
};

JPlayer player;
Drone d;
//Jew Zerubbabel;
Keys keys;
Bool gameOver;
Bool isPizzaSpawned;

U0 AddBT()
{
 backwardTrack->data = world->data;
 backwardTrack = backwardTrack->next;
 bt++;
}

U0 AddFT()
{
 forwardTrack->data = world->data;
 forwardTrack = forwardTrack->next;
 ft++;
}


//grabs the current backwardTrack from the stack
Vector *GetBT()
{
  backwardTrack=backwardTrack->last;
  Vector *nextV = backwardTrack->data;
  bt--;
  return nextV;
  
}
//grabs the current forwardTrack from the stack
Vector *GetFT()
{
  forwardTrack=forwardTrack->last;
  Vector *nextV = forwardTrack->data;
  ft--;
  return nextV;
  
}


U0 CleanUpLD53(CDC *dc, Matrix *world)
{
 DocClear;
 SettingsPop;
 MenuPop;
 GetChar;
 DCDel(dc);
 DestroyMatrix(world);

}


U0 SongTask(I64)
{
  Fs->task_end_cb=&SndTaskEndCB;
  MusicSettingsRst;
  while(TRUE){
   //Pizza Song
   Play("eeCC#DD#GGDCdBBdd");
   Play("eeeBAEBAEBEAEDAEDAED");
   Play("dA#ACEA#ACE");
   Play("dABABEABDE");
   Play("ee3A3E3DB");
  }
}

U0 AnimateTask(I64)
{
 

}

Bool RandObbV()
{
 if(RandU16%4==0)
  return TRUE;
 return FALSE;
}


U0 DroneMove()
{
 SetMatrix(world,3,d.y,0);
 if(d.y>18)
 {
  d.mv = -1;
 }
 if(d.y<3)
 {
  d.mv = 1;
 }
 d.y = d.y+d.mv;
 SetMatrix(world,3,d.y,6);

}

Vector *ScrollUp(I64 size)
{
 if(ft==0)
 {
 
  I64 ii;
  Vector *newV = CreateVector(size);
  for(ii=0;ii<size;ii++)
  {
   if(ii==0||ii==size-1)
   {
    SetVector(newV,ii,-1);//edge
   }
   else
   {
    U8 val= RandU16%4;
    if(ii>((size/(2+val))-(size/4))&&(ii<(size/(2+val))+(size/4)))
    {
      SetVector(newV,ii,2);//road
    }
    else
    {
      if(ii>size/6&&val==0)
      {
        if(RandObbV&&ii>10)
        {
           SetVector(newV,ii,3);//tree
        }
        else
        {
          if(RandObbV)
          {
           SetVector(newV,ii,5);//cactus
          }
          else
          {
           SetVector(newV,ii,4);//rock
          }
        }
        
      }
      else
      {

        SetVector(newV,ii,0);//sand
      }
    }
    if(player.tilesPassed==3&&player.metJew==FALSE &&ii==13)
    {  
           player.metJew=TRUE;
           SetVector(newV,ii,7);//jew
    }
    
   }
  }
  return newV;
 }
 else
 {
  return GetFT;
 }
}


Vector *ScrollDown(I64 size)
{
 if(bt==0)//returns vector of 1 with none left to generate.
 {
  Vector *newV = CreateVector(1);
  return newV;
 }
 else
 {
  
  return GetBT;
 }
}

//
//Press up on your nav key to move the world down
U0 Forward(I64 size)
{

 I64 i=size-1;
 //first 10 blocks are always sky
 while(i>10)
 {
   world = world->last;
   if(i==size-1)
    AddBT;
   world->data=world->last->data;
   i--;
 }
 world = world->last;
 world->data = ScrollUp(size);
 i--;
 while(i>=0)
 {
  world = world->last;
  i--;
 }

  player.tilesPassed++;
}

//Press down on your nav key to move the world up  
U0 Backward(I64 size)
{
if(bt>0)
{
 I64 i=size-1;
 world = world->last;
 Vector *temp = ScrollDown(size);
 Vector *temp2 = world->data;
 while(i>=10)
 {
   if(i==10)
   {
    AddFT;
   }
   world->data =temp;
   temp = temp2;
   world = world->last;
   temp2 = world->data;
   i--;
 }
 while(i>0)
 {
  world = world->last;
  i--;
 }
 player.tilesPassed--;
}
}
 
U0 DrawRamp(CDC*dc, I64 x, I64 y, I64 z, I64 angle=0)
{
 dc->flags|=DCF_TRANSFORMATION;
 U8 *old_mat=dc->r;
 dc->r=Mat4x4IdentNew;
 Mat4x4TranslationEqu(dc->r,x,y,z);
 Mat4x4RotY(dc->r,angle);
 static CD3I32 ramp0[4]={
  {-RAMP_WIDTH/2,0,0},{RAMP_WIDTH/2,0,0},
  {RAMP_WIDTH/2,-RAMP_WIDTH,RAMP_WIDTH},
  {-RAMP_WIDTH/2,-RAMP_WIDTH,RAMP_WIDTH},
 };
 GrFillPoly3(dc,4,ramp0);
 Free(dc->r);
 dc->r=old_mat;

}

U0 ControlPlayer() {
  if(player.hit_start_ts) {
  if(keys.space||keys.down) {
   Backward(world->x);
  }
   return;
  }
  if(keys.space) {
    keys.space=0; 
    if(tS-player.jump_start_ts<S_JUMP_TIME)
      goto ctrl; //Wait for jump to end 
    player.jump_start_ts=tS;
  }  else if(Bt(kbd.down_bitmap,SC_CURSOR_DOWN)) {
    keys.down=0; 
    player.forward_angle=0;
    player.velo=Clamp(player.velo-PLAYER_ACCEL,-30,30);
  } else if(Bt(kbd.down_bitmap,SC_CURSOR_UP)) {
    keys.up=0; 
    player.forward_angle=0;
    player.velo=Clamp(player.velo+PLAYER_ACCEL,-30,30);
  }
  if(Bt(kbd.down_bitmap,SC_CURSOR_LEFT)) {
    keys.left=0; 
    player.forward_angle=-pi/8;
  } else if(Bt(kbd.down_bitmap,SC_CURSOR_RIGHT)) {
    keys.right=0; 
    player.forward_angle=pi/8;
  }
ctrl:
  player.velo=Clamp(player.velo-Sign(player.velo),-100,100);
  player.usr_yy+=Round(Sin((2*pi-pi/2)+player.forward_angle)*player.velo);
  player.usr_xx+=Round(Cos((2*pi-pi/2)+player.forward_angle)*player.velo);
  if(player.usr_yy-200<PLAYER_MIN_Y) {
    Forward(world->x);
    player.usr_yy=PLAYER_MIN_Y+200;
  } else if(player.usr_yy>PLAYER_MAX_Y) {
    Backward(world->x);
  }
  player.usr_yy=ClampI64(player.usr_yy,PLAYER_MIN_Y,PLAYER_MAX_Y);
  player.usr_xx=ClampI64(player.usr_xx,0,GR_WIDTH);
} 




U0 DrawIt(CTask *task, CDC*dc)
{
 if(gameOver!=TRUE){
 GrPrint(dc,50,FONT_HEIGHT,"Time:%d",(player.time/20));
 GrPrint(dc,150,FONT_HEIGHT,"PizzaLeft:%d",(player.zaLeft));
 if(player.deliver){GrPrint(dc,200,FONT_HEIGHT*2,"DELIVERYREADY!");}
 player.time--;
 player.score+=1;
 GrPrint(dc,450,FONT_HEIGHT,"Score:%d",(player.score/20));
 GrPrint(dc,350,FONT_HEIGHT,"Lvl:%d",(player.curLvl));
 //Render Grid
 I64 x = world->x;
 I64 y = world->y;
 F64 dividX = SCREENX/(world->x);
 F64 dividY = SCREENY/(world->y);
 I64 i,j,colis;
 dc->thick=1;
 
 ControlPlayer;
 
 //background layer
 for(i=0;i<x;i++)
 {
  for(j=0;j<y;j++)
  {
    
    if(j<10)
    {
     if(i==4&&!isPizzaSpawned)
     {
      Bool r = RandObbV;
       dc->color=WHITE;
      if(r)
      {
       SetMatrix(world,4,4,8);
       SetMatrix(world,4,4,8);
      }
      else
      {
       SetMatrix(world,4,4,8);
       SetMatrix(world,4,16,8);
      }
      isPizzaSpawned=TRUE;
     
     } 
     if(j<5)
     {
      if(j<2)
       dc->color=WHITE;
      else
       dc->color = CYAN;
     }
     else
      dc->color=BLUE;
    }
    else
    {
     dc->color=YELLOW;
     if(GetMatrix(world,i,j)==-1)
     { 
      dc->color=BLACK;
     }
     if(GetMatrix(world,i,j)==1)
     { 
      //DrawRamp(dc,i*dividX,y*dividY,0,45);
     }
     if(GetMatrix(world,i,j)==2)
     {
      dc->color=LTRED;
     }
     
    }
    GrLine3(dc,i*dividX, j*dividY, 0, (i+1)*dividX, j*dividY, 0);
    GrLine3(dc,i*dividX, j*dividY, 0, i*dividX, (j+1)*dividY, 0);
    GrLine3(dc,i*dividX, (j+1)*dividY, 0,(i+1)*dividX, (j+1)*dividY, 0);
    GrLine3(dc,(i+1)*dividX, j*dividY, 0,(i+1)*dividX, (j+1)*dividY, 0);
    GrFloodFill(dc,i*dividX+1,j*dividY+1,FALSE,0,0);
  }
 }
 //objects and sprites
 for(j=0;j<y;j++)
 {
  for(i=0;i<x;i++)
  {
    U8 sprite = 0;
    I32 ymod = 0;
     if(GetMatrix(world,i,j)==3)
     {
      ymod=-150;
      sprite = GetTree;
     }
     if(GetMatrix(world,i,j)==4)
     {
      sprite = GetRock;
     }
     if(GetMatrix(world,i,j)==5)
     {
      ymod=-125;
      sprite = GetCactus;
     }
     if(GetMatrix(world,i,j)==6)
     {
       sprite = GetDrone;
     }
     
     if(GetMatrix(world,i,j)==7)
     {
      ymod=-200;
      sprite = GetJew;
     }
     if(GetMatrix(world,i,j)==8)
     {
       sprite = GetPizza;
     }
   if(sprite!=0)
    {
     Sprite3B(dc,i*dividX,j*dividY+ymod,20,sprite);
    }

  }
 }
 CSkateboard skate;

 MemSet(&skate,0,sizeofCSkateboard);
 skate.x=player.usr_xx;
 skate.y=player.usr_yy;
 skate.z=150;
 skate.turn=player.forward_angle;
 DCDepthBufAlloc(dc);
 if(player.jump_start_ts)
   if(SkateboardJump(&skate,tS-player.jump_start_ts))
     player.jump_start_ts=0;
 if(player.hit_start_ts) {
   if(SkateHitAnim(&skate,player.usr_xx,player.usr_yy,player.spin_to_x,player.spin_to_y,tS-player.hit_start_ts)) {
     player.hit_start_ts=0;
     player.usr_xx=player.spin_to_x;
     player.usr_yy=player.spin_to_y;
   }
 }
 skate.y*=1.5;
 skate.x-=GR_WIDTH/2;
 DrawSkateboard(&skate,dc);
 I64 px=0,py=0,pz=0;
 SkateboardScreenCords(&skate,&px,&py,&pz);
 if(!player.hit_start_ts) 
 {
  dc->color=WHITE;
  GrCircle(dc,px,py,100);
 switch(i=GetMatrix(world,px/dividX,py/dividY)) 
 {
   case 5:
hit:
  if(!player.jump_start_ts){
  player.score--;
  for(j=y-1;j>=0;j--) 
  {
    for(i=GR_WIDTH/2/dividX;i<x;i++) 
    {
     colis=GetMatrix(world,i,j);
     if(colis!=5&&colis!=6) {
      player.spin_to_x=i*dividX,player.spin_to_y=j*dividY;
      player.hit_start_ts=tS;
      
      return;
     }
    }
   }
   }else{return;};
   break;case 4: goto hit;
   break;case 8: 
score:
      isPizzaSpawned=FALSE;
      SetMatrix(world,px,py,0);
      SetMatrix(world,px+1,py,0);
      SetMatrix(world,px-1,py,0);
      SetMatrix(world,px,py+1,0);
      player.score_start_ts=tS;

      player.zaLeft--;
      if(player.zaLeft<0)
      {
       player.zaLeft=0;
      }
      player.score=player.score+200;
      return;
  break;
 }
 switch(colis=GetMatrix(world,px/dividX-1,py/dividY)) 
 {
   case 5: goto hit;
   break;case 4: goto hit;
   break;case 8: goto score; break;
 }
  switch(colis=GetMatrix(world,px/dividX+1,py/dividY)) 
 {
   case 5: goto hit;
   break;case 4: goto hit;
    break;case 8: goto score; break;
 }
 switch(colis=GetMatrix(world,px/dividX-2,py/dividY)) 
 {
   case 5: goto hit;
   break;case 4: goto hit;
    break;case 8: goto score; break;
 }
 switch(colis=GetMatrix(world,px/dividX+2,py/dividY)) 
 {
   case 5: goto hit;
   break;case 4: goto hit;
   break;case 8: goto score; break;
 }
 switch(colis=GetMatrix(world,px/dividX,py/dividY+1)) 
 {
   case 5: goto hit;
   break;case 4: goto hit;
   break;case 8: goto score; break;
 }
 switch(colis=GetMatrix(world,px,py)) 
 {
   case 5: goto hit;
   break;case 4: goto hit;
   break;case 8: goto score; break;
 }


 return;
 }
}else {GrPrint(dc,450,FONT_HEIGHT,"FinalScore:%d",(player.score/20));}
} 
//score and timer
//do not remove this bracket
 
 //score and timer
 //gui and lives
 
U0 NewLevel()
{
 player.zaLeft = 3;
 gameOver = FALSE;
 player.time = 600;
 player.score = 0;
 player.metJew = FALSE;
 world = CreateMatrix(20,20);
 backwardTrack = CreateMatrix(200,20);
 forwardTrack = CreateMatrix(200,20);
 isPizzaSpawned = FALSE;
 //spawn drone
 d.y= 3; d.mv=1; player.tilesPassed = 0;
 player.curLvl++;
 SetMatrix(world,3,d.y,6);

}

U8 CutScene(CDC *dc)
{
 
 U8 sprite = GetLordAndSaviour;
 dc->color = RED;
 "\n\t\t\t\tLord!\n";
 "\t\t\t\tTis I,your servant Zerubbabel.";
 "\n\t\t\t\tThank the heavens!\n";
 "\t\t\t\tOnly you can save my wedding party!\n";
 "\t\t\t\tPress space to use your rad skateboard,\n";
 "\t\t\t\tfind all 3 pizza parts\n";
 "\t\t\t\tthen make the Pizza Delivery!";
 Sprite3B(dc,250,475,20,sprite);
 sprite = GetJew;
 Sprite3B(dc,500,100,20,sprite);
 "\n\n\n\n\n\n\n\n\t";
 while(!YorN)
 { 
 "\n\t\t\t\t\tBut you're Jesus!\n\t";
 }
 DocClear;
 DCFill;
}
 

U0 Init(Matrix *w)
{
 QueInit(&w);
 player.usr_xx=GR_WIDTH/2;
 player.usr_yy=GR_HEIGHT-20;
 player.curLvl=0;
}


I64 RunBot(CDC *dc,Matrix *w, I64 a1, I64 a2)
{
 //Instruction *myTask = MAlloc(sizeof(Instruction));
 world = w;
 Fs->draw_it=&DrawIt;
 Fs->song_task=
 Spawn(&SongTask,NULL,"Song",,Fs);

 Init(world);
 while(TRUE)
 {
  DroneMove;
  if(player.time/10<1)
  {
   gameOver=TRUE;
   break;
  }
  if(player.tilesPassed<10&&player.deliver==TRUE)
  {
   player.zaLeft=player.curLvl;
   player.deliver=FALSE;
   player.curLvl++;
   player.time=(player.time+500)-player.curLvl; 
  }
  if(player.zaLeft==0)
  {
   player.deliver=TRUE;
   
  }
  switch(ScanMsg(&a1,&a2,1<<MSG_KEY_DOWN+1<<MSG_KEY_UP))
  {
    case MSG_KEY_UP:
      switch(a1)
      {
        case CH_SPACE:
         keys.space=FALSE;
         break;
        case 0:
        switch(a1.u8[0])
        {
        case SC_CURSOR_LEFT:
          keys.left=FALSE;
         break;
        case SC_CURSOR_RIGHT:
          keys.right=FALSE;
         break;
        case SC_CURSOR_UP:
          keys.up=FALSE;
         break;
        case SC_CURSOR_DOWN:
          keys.down=FALSE;
         break;
        }
        break;
      }
      break;
    case '\n':
      Init(world);
      break;
    case MSG_KEY_DOWN:
      switch(a1)
      {
       case CH_SPACE:
        keys.space=TRUE;
        break;
       case CH_ESC:
       case CH_SHIFT_ESC:
         goto fs_done;
         break;
       case 0:
        switch(a2.u8[0])
        {
        case SC_CURSOR_LEFT:
          keys.left=TRUE;
         break;
        case SC_CURSOR_RIGHT:
          keys.right=TRUE;
         break;
        case SC_CURSOR_UP:
          keys.up=TRUE;
         break;
        case SC_CURSOR_DOWN:
          keys.down=TRUE;
         break;
        }
        break;
      }
      break;
  }
  Refresh;
 }fs_done:
 DCFill;
 //dc->color=BLACK;
 //GrPrint(dc,450,FONT_HEIGHT,"\n\nFinal Score:%d",(player.score/20));
 "\n\n\t\t\t\t\t\t\t\t";
 if(YorN)
 {
 //CleanUpLD53( dc, world);
  DocClear;
  CutScene(dc);
  NewLevel;

  RunBot(dc,world,0,0);
 }
 CleanUpLD53( dc, world);
}


U0 LoadRobot()
{

 I64 pin1=0,pin2=0;
 CDC*dc=DCAlias;//Device Context
 SettingsPush;
 WinMax;
 WinBorder;
 DocCursor;
 DocClear;
 CutScene(dc);
 NewLevel;
 
 //SetMatrix(world,16,3,8);

 RunBot(dc,world,pin1,pin2);
 


}


LoadRobot;
 