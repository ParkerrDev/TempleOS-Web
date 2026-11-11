U0 CastGrName(FinaleGr *tmpg,U8 *text)
{
  U8 *ptr=text;
  I64 x,width=0,ch;
  Image *tmpi;
  if (!text) return;
  while (ch=*ptr++) {
    ch=ToUpper(ch);
    if (33<=ch<33+TM_FINAL_FONT_NUM)
      width+=FinaleGrFont(tmpg,ch)->width;
    else width+=4;
  }
  x=160-width/2;
  ptr=text;
  while (ch=*ptr++) {
    ch=ToUpper(ch);
    if (33<=ch<33+TM_FINAL_FONT_NUM) {
      tmpi=FinaleGrFont(tmpg,ch);
      FinaleGrImage(tmpg,tmpi,x,180); x+=tmpi->width;
    } else x+=4;
  }
}

U0 CastGrDraw(FinaleGr *tmpg,Cast *tmpc,Sprites *tmps,Story *story)
{//Use the front rotation and authored name without world lighting.
  State *state=tmpc->data->state+tmpc->state;
  I64 code;
  Image *tmpi;
  if (tmpg->story!=7 || tmpg->wad!=tmps->wad ||
	tmpc->data!=tmps->data) throw('Owner');
  FinaleGrImage(tmpg,FinaleGrPatch(tmpg,0,"BOSSBACK"),0,0);
  CastGrName(tmpg,story->cast[tmpc->num]);
  code=SpriteFrame(tmps,state->sprite,state->frame,0);
  if (!(tmpi=SpriteGet(tmps,code))) throw('Sprite');
  FinaleGrImage(tmpg,tmpi,160,170,code<0);
}
