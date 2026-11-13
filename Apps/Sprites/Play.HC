#exe {Cd(__DIR__);}

CDC *sprite_images[SPRITE_COUNT];
F64 sprite_started;

U0 DrawIt(CTask *task,CDC *dc)
{
  I64 frame=ToI64(Floor((tS-sprite_started)*1000/SPRITE_DELAY))%SPRITE_COUNT;
  CDC *dc1=sprite_images[frame];
  dc->color=WHITE;
  GrRect(dc,0,0,task->pix_width,task->pix_height);
  GrBlot(dc,(task->pix_width-dc1->width)/2,
    (task->pix_height-dc1->height)/2,dc1);
}

U0 PlaySprites()
{
  I64 i;
  U8 name[STR_LEN];
  MemSet(sprite_images,0,sizeof(sprite_images));
  SettingsPush;
  try {
    for (i=0;i<SPRITE_COUNT;i++) {
      StrPrint(name,"Frame%03d.GR",i);
      if (!(sprite_images[i]=GRRead(name))) throw('Sprite');
    }
    AutoComplete;
    WinBorder;
    WinMax;
    DocCursor;
    DocClear;
    sprite_started=tS;
    Fs->draw_it=&DrawIt;
    GetChar;
  } catch
    PutExcept;
  SettingsPop;
  for (i=0;i<SPRITE_COUNT;i++) {
    DCDel(sprite_images[i]);
    sprite_images[i]=NULL;
  }
}

PlaySprites;
