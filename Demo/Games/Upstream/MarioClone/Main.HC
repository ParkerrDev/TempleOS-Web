#include "Wad.HC";
#include "Globals.HC";
#include "Spawn.HC";
#include "Level.HC";
#include "Game.HC";
#include "Update.HC";
#include "Draw.HC";
#include "Sounds.HC";

U8 *WORLD_FILE = MStrPrint("%s%s",DirCur,"/Levels/World1-1.TXT");

U0 FreeEverything(CDC *dc, Level *lvl){
 DCDel(dc);
 Free(lvl->tileState);
 Free(lvl->tileBounce);
 Free(lvl->tileBounceVel);
}

U0 MarioMain()
{
 CDC *dc = DCAlias;
 I64 arg1, arg2;
 I64 input;

 SettingsPush; WinMax; WinBorder;
 DocCursor; DocClear; AutoComplete(0);

 InitMario();
 clvl = LoadLevel(WORLD_FILE);
 Fs->draw_it = &DrawMarioGame;
 Fs->song_task=Spawn(&SongTask,Fs);
 Fs->animate_task=Spawn(&AnimateTask,Fs);

 while(TRUE){
  while(input = GetMsg(&arg1,&arg2,
     1<<MSG_KEY_DOWN | 1<<MSG_KEY_UP))
  { 
  switch(input)
  {
   case MSG_KEY_DOWN:
    switch(arg1)
    {
     case 'a': case 'A': keyL = 1; break;
     case 'd': case 'D': keyR = 1; break;
     case 'w': case 'W': case ' ': keyJump = 1; break;
     case CH_ESC: goto fs_end;
    }

    if(arg1 == 0){
     switch(arg2.u8[0]){
      case SC_CURSOR_LEFT:  keyL = 1; break;
      case SC_CURSOR_RIGHT: keyR = 1; break;
      case SC_CURSOR_UP:    keyJump = 1; break;
     }
    }
   break;
   case MSG_KEY_UP:
    switch(arg1)
    {
     case 'a': case 'A': keyL = 0; break;
     case 'd': case 'D': keyR = 0; break;
     case 'w': case 'W': case ' ': keyJump = 0; break;
    }

    if(arg1 == 0){
     switch(arg2.u8[0]){
      case SC_CURSOR_LEFT:  keyL = 0; break;
      case SC_CURSOR_RIGHT: keyR = 0; break;
      case SC_CURSOR_UP:    keyJump = 0; break;
     }
    }
   break;
  }

 }
 Refresh;

}

fs_end:
 FreeEverything(dc, clvl);
 SettingsPop;
}

MarioMain;$SY,3$