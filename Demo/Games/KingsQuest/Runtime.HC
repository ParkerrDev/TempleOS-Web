class KqActor
{
  I64 view,loop,cel,x,y,mode,dir,cycle,delay,tick,step_x,step_y;
  I64 priority,flags,block,target_x,target_y,distance;
  I64 saved_loop,saved_cel,jump_dx;
  I64 last_x,last_y,avoid_phase,avoid_count,avoid_length,avoid_rx,avoid_ry;
  Bool avoid_turn,barrier_detour,swoop,flight_side;
  Bool loaded,visible,loop_lock;
};
KqActor kq_actor[111];
U8 kq_var[256],kq_object[888];
I64 kq_next_room,kq_text_room,kq_picture;
I64 kq_verb,kq_noun,kq_dir,kq_block_x,kq_block_y;
I64 kq_block_left,kq_block_right,kq_block_top,kq_block_bottom;
Bool kq_input_matched,kq_control,kq_cycle_all,kq_game_over,kq_quit;
U8 kq_input[80],kq_messages[8][81],kq_display[25][81];
I64 kq_message_row,kq_message_col,kq_input_len,kq_text_fg,kq_text_bg;
U8 *kq_words,*kq_sound;
I64 kq_sound_size,kq_sound_at,kq_sound_end,kq_sound_delay;
I64 kq_sound_base,kq_sound_start;
I64 kq_tone[3],kq_volume[4],kq_latch,kq_last_tone;
Bool kq_mute;

U8 *KqText(I64 room,I64 off)
{
  if (!(0<=room<85)) return "";
  if (!kq_texts[room])
    kq_texts[room]=KqResource("MSG",room,&kq_text_sizes[room]);
  if (!kq_texts[room] || !(0<=off<kq_text_sizes[room])) return "";
  return kq_texts[room]+off;
}

U0 KqNewLine()
{
  if (kq_message_row<7) kq_message_row++;
  else {
    MemCpy(kq_messages,kq_messages[1],7*81);
    MemSet(kq_messages[7],0,81);
  }
  kq_message_col=0;
}

U0 KqSay(U8 *st)
{
  I64 ch;
  if (kq_message_col) KqNewLine;
  while (ch=*st++) {
    if (ch==13 || ch==10) KqNewLine;
    else if (ch>=32) {
      if (kq_message_col>=78) KqNewLine;
      kq_messages[kq_message_row][kq_message_col++]=ch;
      kq_messages[kq_message_row][kq_message_col]=0;
    }
  }
}

Bool KqPos(I64 x1,I64 y1,I64 x2,I64 y2)
{
  return x1<=kq_actor[0].x<=x2 && y1<=kq_actor[0].y<=y2;
}

Bool KqSaid(I64 verb,I64 noun)
{
  return (verb==250 || kq_verb==verb) &&
	(noun==250 || kq_noun==noun);
}

I64 KqPriority(KqActor *a)
{
  if (a->flags&1) return a->priority;
  return MinI64(15,MaxI64(1,(a->y-40)/8));
}

Bool KqWalk(I64 id,I64 x,I64 y)
{
  KqActor *a=&kq_actor[id],*b;
  U8 *cel=KqCel(a->view,a->loop,a->cel),*other;
  I64 width=1,pri=KqPriority(a),i,p,water=0;
  if (!(a->flags&1)) pri=MinI64(15,MaxI64(1,(y-40)/8));
  if (cel) width=cel[1];
  for (i=0;i<width;i++) {
    p=kq_pri[y*KQ_W+x+i];
    if (p==15 && !(a->flags&2)) return FALSE;
    if (!id) {
      if (kq_var[4] && p==1 || !kq_var[4] && p) water++;
    } else if (id==107) {
      if (p==1) return FALSE;
    } else if (!p && !(a->flags&4)) return FALSE;
    if (pri!=1 && p==pri && (p!=15 || !(a->flags&2)))
      return FALSE;
  }
  if (!(a->flags&2))
    for (i=0;i<111;i++) {
      b=&kq_actor[i];
      if (i!=id && b->visible && b->loaded) {
	other=KqCel(b->view,b->loop,b->cel);
	if (other && b->x<=x+width && x-1<=b->x+other[1] &&
	      y==b->y) {
	  if (!id) kq_var[6]=i;
	  else if (!i && a->mode!=17) kq_var[6]=id;
	  return FALSE;
	}
      }
    }
  if (!id) {
    kq_var[4]=!water;
    if (!water) kq_var[5]=kq_pic[y*KQ_W+x+width-1];
  }
  return TRUE;
}

Bool KqPlace(I64 id)
{//The original draw call spirals outward to find a legal sprite position.
  KqActor *a=&kq_actor[id];
  U8 *p=KqCel(a->view,a->loop,a->cel);
  I64 x=a->x,y=a->y,width=1,n=1,len=1,dir=4,i;
  if (!p || !a->loaded) return FALSE;
  width=p[1];
  for (i=0;i<8*KQ_PIXELS;i++) {
    if (1<a->x<=157-width && 1<a->y<168 && KqWalk(id,a->x,a->y))
      return TRUE;
    switch (dir) {
      case 4: a->y--;break;
      case 3: a->x++;break;
      case 2: a->y++;break;
      case 1: a->x--;break;
    }
    if ((dir==3 || dir==1) && n==1) len++;
    if (!--n) {n=len;if (!--dir) dir=4;}
  }
  a->x=x;a->y=y;return FALSE;
}

class KqUnder
{
  I64 x,y,width,height;
  U8 *data;
};
KqUnder kq_under[111];
MemSet(kq_under,0,sizeof(kq_under));

U0 KqUnderDrop(I64 id,Bool restore=FALSE)
{//A stopped sprite retains the pixels and priority hidden beneath it.
  KqUnder *u=&kq_under[id];
  I64 x,y,n=0,i;
  if (u->data && restore)
    for (y=0;y<u->height;y++)
      for (x=0;x<u->width;x++) {
	i=(u->y+y)*KQ_W+u->x+x;
	kq_pic[i]=u->data[n]>>4;kq_pri[i]=u->data[n++]&15;
      }
  Free(u->data);MemSet(u,0,sizeof(KqUnder));
}

U0 KqUnderClear()
{
  I64 i;
  for (i=0;i<111;i++) KqUnderDrop(i);
}

U0 KqStamp(I64 id)
{
  KqActor *a=&kq_actor[id];
  KqUnder *u=&kq_under[id];
  U8 *p=KqCel(a->view,a->loop,a->cel);
  I64 x,y,n=0,i,pri,row,width,top;
  KqUnderDrop(id);
  if (!p) {a->visible=FALSE;return;}
  u->x=MaxI64(0,a->x);u->y=MaxI64(0,a->y-p[0]+1);
  u->width=MaxI64(0,MinI64(KQ_W,a->x+p[1])-u->x);
  u->height=MaxI64(0,MinI64(KQ_H,a->y+1)-u->y);
  u->data=MAlloc(u->width*u->height);
  for (y=0;y<u->height;y++)
    for (x=0;x<u->width;x++) {
      i=(u->y+y)*KQ_W+u->x+x;
      u->data[n++]=kq_pic[i]*16+kq_pri[i];
    }
  MemCpy(kq_pixels,kq_pic,KQ_PIXELS);
  pri=MinI64(15,MaxI64(1,(a->y-40)/8));
  if (a->flags&1) pri=a->priority;
  KqSprite(a->view,a->loop,a->cel,a->x,a->y,pri,TRUE);
  width=p[1];top=a->y&~7;
  for (row=top;row<=a->y;row++)
    for (i=0;i<width;i++)
      if (0<=a->x+i<160 && 0<=row<168 &&
	    (row==a->y || row==top || !i || i==width-1))
	kq_pri[row*160+a->x+i]=15;
  MemCpy(kq_pic,kq_pixels,KQ_PIXELS);a->visible=FALSE;
}

U0 KqActorSet(I64 id,I64 view)
{
  KqActor *a;
  U8 *p;
  if (!(0<=id<111 && 0<=view<111)) return;
  a=&kq_actor[id];a->view=view;a->loop=0;a->cel=0;
  p=KqView(view);
  if (!p || p[2]==255) {a->loaded=FALSE;return;}
  if (p[2]>=2) a->loop=1;
  if (p[2]>=3) a->loop=2;
  p=KqLoop(view,a->loop);
  a->step_x=MaxI64(1,p[0]);a->step_y=MaxI64(1,p[1]);
  a->delay=MaxI64(1,p[2]);a->loaded=TRUE;
}

U0 KqSound(I64 n)
{
  I64 i,group,part;
  if (!n) n=kq_sound_base;
  else if (!kq_sound_base) kq_sound_base=n;
  group=(n-1)/4;part=(n-1)%4;
  Free(kq_sound);kq_sound=NULL;kq_sound_at=0;kq_sound_end=0;
  kq_sound_delay=0;kq_var[15]=0;
  if (n<1) {Snd;return;}
  kq_sound=KqResource("SND",group,&kq_sound_size);
  if (!kq_sound) {kq_var[15]=1;return;}
  kq_sound_at=8;
  for (i=0;i<part;i++) kq_sound_at+=KqWord(kq_sound+i*2);
  kq_sound_end=kq_sound_at+KqWord(kq_sound+part*2);
  kq_sound_start=kq_sound_at;
  for (i=0;i<4;i++) kq_volume[i]=15;
}

U0 KqSoundTick()
{
  I64 n,b,c,i,best=15,tone=0;
  if (kq_sound_delay) kq_sound_delay--;
  if (kq_sound && !kq_sound_delay && kq_sound_at<kq_sound_end) {
    n=kq_sound[kq_sound_at++];
    while (n-- && kq_sound_at<kq_sound_end) {
      b=kq_sound[kq_sound_at++];
      if (b&128) kq_latch=b>>4&7;
      c=kq_latch>>1;
      if (kq_latch&1) kq_volume[c]=b&15;
      else if (c<3) {
	if (b&128) kq_tone[c]=kq_tone[c]&1008+b&15;
	else kq_tone[c]=kq_tone[c]&15+(b&63)<<4;
      }
    }
    if (kq_sound_at<kq_sound_end)
      kq_sound_delay=kq_sound[kq_sound_at++];
    if (kq_sound_delay==255) {
      kq_sound_at=kq_sound_start;kq_sound_delay=1;
    } else if (!kq_sound_delay || kq_sound_at>=kq_sound_end) {
      kq_sound_at=kq_sound_end;kq_var[15]=1;
      for (i=0;i<4;i++) kq_volume[i]=15;
    }
  }
  if (!kq_mute)
    for (i=0;i<3;i++)
      if (kq_tone[i] && kq_volume[i]<best) {
	best=kq_volume[i];tone=Freq2Ona(111860.8/kq_tone[i]);
      }
  if (tone!=kq_last_tone) {Snd(tone);kq_last_tone=tone;}
}

U0 KqSave(Bool restore)
{//Store values and sprite underlays; never serialize host pointers.
  I64 base=256+888+sizeof(KqActor)*111+128+2*KQ_PIXELS,
	size=base,n,i,len,at,*engine,*box;
  KqUnder *u;
  U8 *p;
  if (restore) {
    p=FileRead("~/KingsQuest.SAV",&n);
    if (!p || n<base+111*32 || StrNCmp(p,"KQHC03",6)) {
      KqSay("No King's Quest save was found.");Free(p);return;
    }
    at=base;
    for (i=0;i<111;i++) {
      if (at+32>n) break;
      box=p+at;len=box[2]*box[3];
      if (!(0<=box[0]<160 && 0<=box[1]<168 &&
	    0<=box[2]<=160-box[0] && 0<=box[3]<=168-box[1]) ||
	    at+32+len>n) break;
      at+=32+len;
    }
    if (i!=111 || at!=n) {
      KqSay("The saved game is incomplete.");Free(p);return;
    }
    KqUnderClear;
    MemCpy(kq_var,p+48,256);MemCpy(kq_object,p+304,888);
    MemCpy(kq_actor,p+1192,sizeof(KqActor)*111);
    kq_picture=*(&p[8])(I64 *);
    kq_control=*(&p[24])(I64 *);kq_cycle_all=*(&p[32])(I64 *);
    engine=p+1192+sizeof(KqActor)*111;
    kq_block_x=engine[0];kq_block_y=engine[1];
    kq_block_left=engine[2];kq_block_right=engine[3];
    kq_block_top=engine[4];kq_block_bottom=engine[5];
    kq_game_over=engine[6];kq_dir=engine[7];
    kq_sound_base=engine[8];kq_next_room=engine[9];
    MemCpy(kq_pic,engine(U8 *)+80,KQ_PIXELS);
    MemCpy(kq_pri,engine(U8 *)+80+KQ_PIXELS,KQ_PIXELS);
    at=base;
    for (i=0;i<111;i++) {
      u=&kq_under[i];box=p+at;
      u->x=box[0];u->y=box[1];u->width=box[2];u->height=box[3];
      len=u->width*u->height;at+=32;
      if (len) {u->data=MAlloc(len);MemCpy(u->data,p+at,len);}
      at+=len;
    }
    KqSound(0);KqSay("Game restored.");
  } else {
    for (i=0;i<111;i++)
      size+=32+kq_under[i].width*kq_under[i].height;
    p=CAlloc(size);StrCpy(p,"KQHC03");
    *(&p[8])(I64 *)=kq_picture;
    *(&p[24])(I64 *)=kq_control;*(&p[32])(I64 *)=kq_cycle_all;
    MemCpy(p+48,kq_var,256);MemCpy(p+304,kq_object,888);
    MemCpy(p+1192,kq_actor,sizeof(KqActor)*111);
    engine=p+1192+sizeof(KqActor)*111;
    engine[0]=kq_block_x;engine[1]=kq_block_y;
    engine[2]=kq_block_left;engine[3]=kq_block_right;
    engine[4]=kq_block_top;engine[5]=kq_block_bottom;
    engine[6]=kq_game_over;engine[7]=kq_dir;
    engine[8]=kq_sound_base;engine[9]=kq_next_room;
    MemCpy(engine(U8 *)+80,kq_pic,KQ_PIXELS);
    MemCpy(engine(U8 *)+80+KQ_PIXELS,kq_pri,KQ_PIXELS);
    at=base;
    for (i=0;i<111;i++) {
      u=&kq_under[i];box=p+at;
      box[0]=u->x;box[1]=u->y;box[2]=u->width;box[3]=u->height;
      len=u->width*u->height;at+=32;
      if (len) MemCpy(p+at,u->data,len);
      at+=len;
    }
    if (FileWrite("~/KingsQuest.SAV",p,size)) KqSay("Game saved.");
    else KqSay("Unable to save. Check free space in Home.");
  }
  Free(p);
}

U0 KqAction(I64 op,I64 x=0,I64 y=0,I64 z=0)
{
  I64 i,n;
  U8 *p;
  KqActor *a=&kq_actor[MinI64(x,110)],*ego=&kq_actor[0];
  switch (op) {
    case 1:
      KqActorSet(0,0);ego->loop=0;ego->cel=6;
      ego->x=kq_object[5];ego->y=kq_object[6];
      kq_var[1]=1;
      break;
    case 2:
      KqUnderDrop(x);MemSet(a,0,sizeof(KqActor));
      KqActorSet(x,x);a->x=kq_object[x*8+5];
      a->y=kq_object[x*8+6];a->visible=FALSE;
      break;
    case 3:
      for (i=1;i<111;i++) {
	a=&kq_actor[i];
	if (a->loaded && a->visible) {
	  kq_object[i*8+2]=kq_object[i*8+2]&128+kq_var[1];
	  kq_object[i*8+4]=a->loop<<4+a->cel;
	  kq_object[i*8+5]=a->x;kq_object[i*8+6]=a->y;
	}
	a->loaded=FALSE;a->visible=FALSE;
      }
      break;
    case 4:
      kq_next_room=x;break;
    case 5:
      KqUnderClear;
      kq_picture=x;KqPicture(x);break;
    case 6:
      break;
    case 7:
      KqUnderDrop(x,TRUE);a->visible=KqPlace(x);kq_object[x*8+2]=
	    kq_object[x*8+2]&128+kq_var[1];
      break;
    case 8:
      kq_var[x]=1;break;
    case 9:
      kq_var[x]=0;break;
    case 10:
    case 62:
      KqSay(KqText(kq_text_room,x));break;
    case 11:
      kq_object[x*8+2]|=128;break;
    case 12:
      KqUnderDrop(x,TRUE);a->visible=FALSE;kq_object[x*8+2]&=128;break;
    case 13:
      kq_object[x*8+2]&=127;break;
    case 14:
      kq_actor[y].x=a->x;kq_actor[y].y=a->y;break;
    case 15:
      KqSound(x);break;
    case 16:
      if (kq_var[x]<250) kq_var[x]++;
      break;
    case 17:
      if (kq_var[x]) kq_var[x]--;
      break;
    case 18:
      kq_var[x]=y;break;
    case 19:
      a->cel=y;a->cycle=1;break;
    case 20:
      kq_var[19]+=x;break;
    case 21:
      kq_var[19]-=x;break;
    case 22:
      kq_var[8]=0;a->cycle=4;
      if (!x) kq_control=FALSE;
      break;
    case 23:
      kq_var[8]=0;p=KqLoop(a->view,a->loop);
      if (p) a->cel=p[3];
      a->cycle=2;break;
    case 24:
      kq_var[8]=0;a->mode=14;a->target_x=y;a->target_y=z;
      if (!x) kq_control=FALSE;
      break;
    case 25:
      a->x=y;a->y=z;kq_object[x*8+5]=y;kq_object[x*8+6]=z;
      break;
    case 26:
      a->block=TRUE;break;
    case 27:
      a->block=FALSE;break;
    case 28:
    case 65:
      if (!ego->view && x) {
	ego->saved_loop=ego->loop;ego->saved_cel=ego->cel;
      }
      KqActorSet(0,x);kq_var[26]=x;
      if (!x) {
	ego->loop=ego->saved_loop;ego->cel=ego->saved_cel;
      }
      break;
    case 29:
      kq_var[8]=0;a->mode=15;a->flags|=1;a->priority=15;break;
    case 30:
      a->mode=17;a->flags|=1;a->priority=15;a->distance=y;a->swoop=TRUE;break;
    case 31:
      a->mode=12;a->cycle=0;a->distance=5;break;
    case 32:
      kq_block_x=x;kq_block_left=y;kq_block_right=z;break;
    case 33:
      kq_block_y=x;kq_block_top=y;kq_block_bottom=z;break;
    case 34:
      a->mode=16;break;
    case 35:
      ego->mode=13;ego->target_x=ego->x;ego->target_y=x;
      ego->step_y=4;kq_control=FALSE;break;
    case 36:
      KqView(x);break;
    case 37:
      KqUnderClear;
      kq_picture=x;KqPicture(x);break;
    case 38:
      a->loop=y;a->cel=z;
      if (KqPlace(x)) KqStamp(x);
      break;
    case 39:
      KqUnderDrop(x,TRUE);
      a->loop=y;a->cel=z;a->visible=TRUE;break;
    case 40:
      ego->mode=14;ego->target_x=x;ego->target_y=ego->y;
      ego->step_x=4;kq_control=FALSE;break;
    case 41:
    case 64:
      break; //Original resource prefetch; native room functions are resident.
    case 42:
      ego->cycle=0;kq_cycle_all=TRUE;kq_control=FALSE;break;
    case 43:
    case 67:
      kq_game_over=TRUE;kq_dir=0;break;
    case 44:
      break;
    case 45:
      ego->saved_loop=ego->loop;ego->saved_cel=ego->cel;
      KqActorSet(0,x);ego->x-=y;ego->cycle=5;ego->jump_dx=y;
      ego->flags=7;kq_control=FALSE;kq_var[26]=1;break;
    case 46:
      kq_control=TRUE;kq_cycle_all=FALSE;break;
    case 47:
      a->flags|=1;a->priority=y;break;
    case 48:
      KqActorSet(x,y);a->loop=0;a->cel=0;break;
    case 49:
      KqSay("You are carrying:");
      p=FileRead("Data/NAMES.BIN",&n);
      if (p) {
	n=0;
	for (i=0;i<111;i++) {
	  if (kq_object[i*8+2]&128 && p[n]) KqSay(p+n);
	  n+=StrLen(p+n)+1;
	}
	Free(p);
      }
      break;
    case 50:
      KqSave(FALSE);break;
    case 51:
      KqSave(TRUE);break;
    case 52:
      a->flags&=~1;break;
    case 53:
      kq_var[x]=kq_var[1];break;
    case 54:
      kq_var[y]=kq_var[x]==kq_var[1];break;
    case 55:
      kq_next_room=kq_var[x];break;
    case 56:
      a->loop=y;a->loop_lock=TRUE;break;
    case 57:
      KqUnderDrop(x,TRUE);KqStamp(x);
      kq_object[x*8+5]=a->x;kq_object[x*8+6]=a->y;break;
    case 58:
      a->flags|=6;break;
    case 59:
      a->flags&=~6;break;
    case 60:
      kq_text_fg=x;kq_text_bg=y;break;
    case 61:
      if (0<=x<25 && 0<=y<80) {
	p=KqText(kq_text_room,z);
	n=MinI64(80-y,StrLen(p));
	MemCpy(kq_display[x]+y,p,n);kq_display[x][y+n]=0;
      }
      break;
    case 63:
      GetKey;break;
    case 66:
      kq_game_over=TRUE;
      KqSay("Start again? Type restart, or restore a saved game.");break;
  }
}
