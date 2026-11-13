I8 tm_fuzz[50]={
  1,-1,1,-1,1,1,-1,1,1,-1,1,1,1,-1,1,1,1,-1,-1,-1,-1,
  1,-1,-1,1,1,1,1,-1,1,-1,1,1,-1,-1,1,1,-1,-1,-1,-1,
  1,1,1,1,-1,1,1,-1,1
};

U0 OverlayBlot(View *tmpv,Image *tmpi,I64 x,I64 y,Bool flip,U8 *color)
{//Unit-scale psprites retain the original half-pixel vertical placement.
  I64 x0,y0,x1,x2,y1,y2,u,v,c;
  U8 *dst;
  x0=x>>16-tmpi->left; y0=(y+32767)>>16;
  y0+=tmpv->height/2-100-tmpi->top;
  x1=MaxI64(x0,0); x2=MinI64(x0+tmpi->width-1,tmpv->width-1);
  y1=MaxI64(y0,0); y2=MinI64(y0+tmpi->height-1,tmpv->height-1);
  if (!color) {
    if (!(0<=tmpv->fuzz<50)) throw('Fuzz');
    y1=MaxI64(y1,1); y2=MinI64(y2,tmpv->height-2);
  }
  for (x=x1;x<=x2;x++) {
    u=x-x0; if (flip) u=tmpi->width-1-u;
    for (y=y1;y<=y2;y++) {
      v=y-y0; c=tmpi->pix[u+v*tmpi->width];
      if (c!=TM_TRANSPARENT) {
	dst=tmpv->pix+x+y*tmpv->width;
	if (color) *dst=color[c];
	else {
	  *dst=tmpv->gr->colormap[6*256+
		dst[tm_fuzz[tmpv->fuzz]*tmpv->width]];
	  if (++tmpv->fuzz==50) tmpv->fuzz=0;
	}
      }
    }
  }
}

U0 PspriteDraw(View *tmpv,Sprites *tmps,Psprite *tmpp,I64 light,
	I64 fixed_colormap,Bool shadow)
{
  State *state;
  Image *image;
  U8 *color;
  I64 code;
  if (!tmpp->state) return;
  if (!StateValid(tmpp->state)) throw('State');
  if (!(0<=light<=31) || !(0<=fixed_colormap<34)) throw('Light');
  state=tmps->data->state+tmpp->state;
  code=SpriteFrame(tmps,state->sprite,state->frame,0);
  if (!(image=SpriteGet(tmps,code))) throw('Sprite');
  if (fixed_colormap) light=fixed_colormap;
  else if (state->frame&0x8000) light=0;
  color=tmpv->gr->colormap+light*256;
  if (shadow) color=NULL;
  OverlayBlot(tmpv,image,tmpp->x,tmpp->y,code<0,color);
}

U0 PlayerSprites(Level *tmpl,Sprites *tmps)
{//The weapon precedes its flash; invisibility takes precedence over lighting.
  Actor *actor=WorldActorGet(tmpl->world,tmpl->world->player);
  Player *player=&tmpl->player;
  I64 light,n=player->power[TM_PW_INVISIBILITY],i;
  Bool shadow=n>128 || n&8;
  if (!actor || tmps->data!=tmpl->world->data ||
	tmpl->view->map!=tmpl->map) throw('Owner');
  light=ClampI64(tmpl->map->sector[actor->sector].light>>4+
	player->extra_light,0,15);
  light=ClampI64(4*(15-light)-23,0,31);
  for (i=0;i<2;i++)
    PspriteDraw(tmpl->view,tmps,player->psprite+i,light,
	  player->fixed_colormap,shadow);
}
