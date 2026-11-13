CTask *menu_clip_task;
CDoc *menu_clip_doc;
CDocEntry *menu_clip_sprite;
I64 menu_clip_rect[4],menu_clip_extent[4];

U0 MenuClipTask()
{//Open the same stock document and chooser used by Ctrl+M.
  WinHorz(4,75);
  WinVert(5,34);
  WinToTop;
  menu_clip_doc=DocRead("~/PersonalMenu.DD.Z");
  DocMenu(menu_clip_doc);
  DocDel(menu_clip_doc);
}

U0 MenuClipInit()
{
  CDocEntry *tmpde;
  I64 mask;
  menu_clip_task=Spawn(&MenuClipTask,,,,Fs);
  while (!menu_clip_doc || menu_clip_task->display_doc!=menu_clip_doc)
    Sleep(1);
  Refresh(2,TRUE);
  DocLock(menu_clip_doc);
  menu_clip_doc->flags|=DOCF_HIDE_CURSOR|DOCF_DONT_HIGHLIGHT_CURSOR;
  menu_clip_doc->cur_entry=menu_clip_doc->head.next;
  tmpde=menu_clip_doc->head.next;
  while (tmpde!=menu_clip_doc) {
    if (tmpde->type_u8==DOCT_SPRITE && tmpde->bin_data) {
      mask=SpriteTypeMask(tmpde->bin_data->data);
      if (!(mask&(1<<SPT_MESH|1<<SPT_SHIFTABLE_MESH))) {
	menu_clip_sprite=tmpde;
	break;
      }
    }
    tmpde=tmpde->next;
  }
  DocUnlock(menu_clip_doc);
  if (!menu_clip_sprite) throw('NoSprite');
  SpriteExtents(menu_clip_sprite->bin_data->data,&menu_clip_extent[0],
	&menu_clip_extent[1],&menu_clip_extent[2],&menu_clip_extent[3]);
}

U0 MenuClipPose(I64 pose)
{//Scroll through native scrollbar positions, clipping both sprite edges.
  I64 h=menu_clip_extent[3]-menu_clip_extent[2]+1,visible,
	x=menu_clip_sprite->x,y,line;
  if (!(menu_clip_sprite->de_flags&DOCEF_FROM_START))
    x+=StrLen(menu_clip_sprite->tag);
  x=x*FONT_WIDTH+menu_clip_task->pix_left;
  switch (pose%3) {
    case 0:visible=8;break;
    case 1:visible=h/2;break;
    case 2:visible=h-8;break;
  }
  if (pose<3)
    line=(menu_clip_sprite->y*FONT_HEIGHT+menu_clip_extent[2]-
	  menu_clip_task->pix_height+visible)/FONT_HEIGHT;
  else
    line=(menu_clip_sprite->y*FONT_HEIGHT+menu_clip_extent[3]-
	  visible+1)/FONT_HEIGHT;
  menu_clip_task->vert_scroll.pos=line;
  LBts(&menu_clip_task->vert_scroll.flags,WSSf_SET_TO_POS);
  LBts(&menu_clip_doc->flags,DOCf_DO_FULL_REFRESH);
  Refresh(3,TRUE);
  y=(menu_clip_sprite->y-menu_clip_doc->top_line_num)*FONT_HEIGHT+
	menu_clip_task->pix_top;
  menu_clip_rect[0]=MaxI64(menu_clip_task->pix_left,x+menu_clip_extent[0]);
  menu_clip_rect[1]=MinI64(menu_clip_task->pix_right,x+menu_clip_extent[1]);
  menu_clip_rect[2]=MaxI64(menu_clip_task->pix_top,y+menu_clip_extent[2]);
  menu_clip_rect[3]=MinI64(menu_clip_task->pix_bottom,y+menu_clip_extent[3]);
  LBtr(&menu_clip_doc->flags,DOCf_DO_FULL_REFRESH);
}

U64 MenuClipHash()
{//Hash only the visible part of the stock sprite in a completed screen.
  CDC *dc=DCScrnCapture;
  I64 x,y;
  U64 res=0xCBF29CE484222325;
  for (y=menu_clip_rect[2];y<=menu_clip_rect[3];y++)
    for (x=menu_clip_rect[0];x<=menu_clip_rect[1];x++) {
      res^=dc->body[y*dc->width_internal+x];
      res*=0x100000001B3;
    }
  DCDel(dc);
  return res;
}

U0 MenuClipCheck()
{
  I64 pose,i;
  U64 hash;
  MenuClipInit;
  for (pose=0;pose<6;pose++) {
    MenuClipPose(pose);
    hash=MenuClipHash;
    for (i=0;i<24;i++) {
      Refresh(2,TRUE);
      if (MenuClipHash!=hash) throw('Flicker');
    }
    "MENU %d %d %d %d %d %016X\n",pose,menu_clip_rect[0],
	menu_clip_rect[1],menu_clip_rect[2],menu_clip_rect[3],hash;
  }
  Kill(menu_clip_task);
}

U0 MenuClipRepro()
{//Unmodified V5.03 alternates full and incremental sprite visibility.
  I64 i;
  MenuClipInit;
  MenuClipPose(0);
  for (i=0;i<48;i++) {
    Refresh(1,TRUE);
    "REPRO %016X\n",MenuClipHash;
  }
  Kill(menu_clip_task);
}
