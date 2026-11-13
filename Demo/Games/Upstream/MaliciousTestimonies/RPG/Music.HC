#define TPTOWN_SONG	0
#define MTMAIN_SONG	1
#define CHFATE_SONG	2
#define HOLYMT_SONG	3
#define LOADME_SONG	4
#define DULL_SONG	5
#define CHATGPT_SONG	5
U0 SongTask(MenuControl *mc, CTask *task, CDC *dc)
{
 Fs->task_end_cb=&SndTaskEndCB;
 MusicSettingsRst;
 DeserializeOpts;
 if(!mc->musicMuted){
  Play("...0Ct1Ct2Ct3C4C");}
 while(TRUE){
 //DeserializeOpts;  
  if(mc->musicMuted){Sleep(100);goto loop;}
  switch(mc->currentSong)//muted
  {
   case TPTOWN_SONG:
   //Town Song
    Play("3qCet2EG3.q2BetDF3.qDet2FA3.qCet2EG3.");//I am heading home
    if(mc->currentSong!=0||mc->musicMuted==TRUE)
    goto loop;
    Play("2qGet1GB2D1G2CE1G2D2GA#3D.");//I am heading home
    if(mc->currentSong!=0||mc->musicMuted==TRUE)
    goto loop;
    Play("3qCet2EG3.q2BetDF3.qDet2FA3.qCet2EG3.2.hA.et1AF#GEFGAC.");//I am heading home
    if(mc->currentSong!=0||mc->musicMuted==TRUE)
    goto loop;
    Play("3qCtt2EG3..q2Bett1B2D#F#3..q3Dett1A2C#E3..");//I am heading I am heading I am heading home
    if(mc->currentSong!=0||mc->musicMuted==TRUE)
    goto loop;
    Play("q2Gett1GA#2D3..q2AGett1GA#2D..q2Bett1B2D#F#..");//I am heading I am heading I am heading home
    if(mc->currentSong!=0||mc->musicMuted==TRUE)
    goto loop;
    Play("q2Eett1FG#2C..q3Eett1FG#2C..q3DF2Bett1B2D#F#..q3hCq");//I am heading I am heading I am heading home
    if(mc->currentSong!=0||mc->musicMuted==TRUE)
    goto loop;
    Play("3Gett1GA#2D3..qEett1FG#2C3..qFett1F#A2C#3..qDett1A2C#E3..");//What should we expect of you?
    if(mc->currentSong!=0||mc->musicMuted==TRUE)
    goto loop;
    Play("qEett1FG#2C3..qCett2EG3..qCett2EG3..qCett2EG3..q");//What should we expect of you?
    if(mc->currentSong!=0||mc->musicMuted==TRUE)
    goto loop;
    Play("3Gett1GA#2D3..qEett1FG#2C3..qFett1F#A2C#3..");//When you've headed home?
    if(mc->currentSong!=0||mc->musicMuted==TRUE)
    goto loop;
    Play("qCtt2EG3..wDett1A2C#E3..q");//When you've headed home?
    if(mc->currentSong!=0||mc->musicMuted==TRUE)
    goto loop;
    Play("3Gett1GA#2D3..qEett1FG#2C3..qFett1F#A2C#3..");//What things shall we do with you?
    if(mc->currentSong!=0||mc->musicMuted==TRUE)
    goto loop;
    Play("qDett1A2C#E3..qEett1FG#2C3..qCett2EG3..qCett2EG3..qCett2EG3..q");//What things shall we do with you?
    if(mc->currentSong!=0||mc->musicMuted==TRUE)
    goto loop;
    Play("3Gett1GA#2D3..qEett1FG#2C3..qFett1F#A2C#3..qDett1A2C#E3..wCtt2EG3..4qC");//Once you're safe at home?  
    if(mc->currentSong!=0||mc->musicMuted==TRUE)
    goto loop;
    break;
    case MTMAIN_SONG:
    //Main Menu
    Play("t5G4B");
    if(mc->currentSong!=1||mc->musicMuted==TRUE)
     goto loop;
    Play("DED");
    if(mc->currentSong!=1||mc->musicMuted==TRUE)
     goto loop;
    Play("B5G");
    if(mc->currentSong!=1||mc->musicMuted==TRUE)
     goto loop;
    Play("4ACD");
    if(mc->currentSong!=1||mc->musicMuted==TRUE)
     goto loop;
    Play("A3G");
    if(mc->currentSong!=1||mc->musicMuted==TRUE)
     goto loop;
    Play("4BD");
    if(mc->currentSong!=1||mc->musicMuted==TRUE)
     goto loop;
    Play("BA");
    if(mc->currentSong!=1||mc->musicMuted==TRUE)
     goto loop;
    Play("EAA");
    if(mc->currentSong!=1||mc->musicMuted==TRUE)
     goto loop;
    Play("3G5AC");
    if(mc->currentSong!=1||mc->musicMuted==TRUE)
     goto loop;
    Play("ACD.");
   break;
   case CHFATE_SONG:
   //character select
    Play("q3#F4A#C");
    if(mc->currentSong!=2)
     goto loop;
    Play("3#F4AD3");
    if(mc->currentSong!=2)
     goto loop;
    Play("#F4A");
    if(mc->currentSong!=2)
     goto loop;
    Play("3E4A#C");   
    if(mc->currentSong!=2)
     goto loop;
    Play("3E4AD"); 
    if(mc->currentSong!=2)
     goto loop;
    Play("3E4A");
    if(mc->currentSong!=2)
     goto loop;
    Play("3D#F4A");
    if(mc->currentSong!=2)
     goto loop;
    Play("3D#F4rh#C");
    if(mc->currentSong!=2)
     goto loop;

   break;
   case HOLYMT_SONG:
   //wedding Theme
    Play("5FrErt4B5D");
    if(mc->currentSong!=3)
     goto loop;
    Play("C4BG");
    if(mc->currentSong!=3)
     goto loop;
    Play("FrGCG");
    if(mc->currentSong!=3)
     goto loop;
    Play("AFA");
    if(mc->currentSong!=3)
     goto loop;
    Play("CFA5C.Fr");
    if(mc->currentSong!=3)
     goto loop;
     Play("Ert4B5DC4BG");
    if(mc->currentSong!=3)
     goto loop;
     Play("FEFAGA");
    if(mc->currentSong!=3)
     goto loop;
     Play("GFrFrFrFr");
    if(mc->currentSong!=3)
     goto loop;
     Play("3FGAG");
    if(mc->currentSong!=3)
     goto loop;
     Play("FEFD.");
    if(mc->currentSong!=3)
     goto loop;
   break;
   case LOADME_SONG://load theme
   
    Play("4CrEFrrr");
    if(mc->currentSong!=4)
     goto loop;
    Play("CrEFrErr");
    if(mc->currentSong!=4)
     goto loop;
    Play("4CrEFrrr");
    if(mc->currentSong!=4)
     goto loop;
    Play("4CEFGFEDr");
    if(mc->currentSong!=4)
     goto loop;
        
   break;
  // case DULL_SONG://combat   
  //   Play("4CrEFrrr");
   //  if(mc->currentSong!=5||mc->musicMuted==TRUE)
  //    goto loop;    
  // break;
   case CHATGPT_SONG:
    Play("4CDEGEGAAFGA5C4BAGEEFG5C4BAGA5CDE4G");
   break;
  }
  loop:
  SndRst;
  music.note_len =.75;
  }
}
