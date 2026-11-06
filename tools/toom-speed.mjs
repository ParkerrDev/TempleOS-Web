// Speed edits for TOOM (Church-of-Templeos/TOOM), applied by tools/sync-games.mjs to copies of the
// upstream sources that the browser package installs in place of the originals. Every edit keeps
// the game identical: same pixels, same level data, same gameplay. Each `find` must occur exactly
// once in its file (or `count` times when set), so a changed upstream fails the sync instead of
// being patched blindly.
export const toomSpeed = {
  'DoomGr.HC': [
    {
      why: 'Image conversion: plot texels with direct stores (same bytes as four GrPlot calls)',
      find: `CDC *PaletteizeImage(I64 w,I64 h,U8 *dith_data) {
  CDC *ret=DCNew(w*2,h*2,doom_task);
  DCFill(ret,TRANSPARENT);
  I64 x,y;
  for(y=0;y!=h;y++) {
    for(x=0;x!=w;x++) {
      if(*dith_data!=TRANSPARENT) {
        ret->color=*dith_data&0xf;
        GrPlot(ret,x*2,y*2);
        GrPlot(ret,x*2+1,y*2+1);
        ret->color=*dith_data>>4;
        GrPlot(ret,x*2+1,y*2);
        GrPlot(ret,x*2,y*2+1);
      }
      dith_data++;
    }
  }
  return ret;
}`,
      replace: `//A DC fresh from DCNew has no brush,no depth buffer and is not the screen,
//so each GrPlot of the original loop was one in-bounds byte store.
CDC *PaletteizeImage(I64 w,I64 h,U8 *dith_data) {
  CDC *ret=DCNew(w*2,h*2,doom_task);
  DCFill(ret,TRANSPARENT);
  I64 x,y,c,wi=ret->width_internal;
  U8 *row,*last=NULL;
  for(y=0;y!=h;y++) {
    row=ret->body+y*2*wi;
    for(x=0;x!=w;x++) {
      if((c=*dith_data)!=TRANSPARENT) {
        row[0]=c&0xf;
        row[wi+1]=c&0xf;
        row[1]=c>>4;
        row[wi]=c>>4;
        last=dith_data;
      }
      row+=2;
      dith_data++;
    }
  }
  if(last)
    ret->color=*last>>4;
  return ret;
}`,
    },
    {
      why: 'Image conversion: clear the texel buffer with MemSet',
      find: `  for(i=0;i!=w;i++)
    for(j=0;j!=h;j++)
      pdata[j*w+i]=TRANSPARENT;`,
      replace: `  MemSet(pdata,TRANSPARENT,w*h);`,
    },
  ],
  'Wad.HC': [
    {
      why: 'Texture composition: scan rows for a transparent pixel instead of one GrPeek0 call per pixel',
      find: `U0 LoadWadTEXTUREs(CWadTEXTURE1 *header,CDoomGr *gr) {
  I64 texture,i,anim_cnt,x,y;
  U8 name[9],buf[16];
  CDC *result,*patch;`,
      replace: `U0 LoadWadTEXTUREs(CWadTEXTURE1 *header,CDoomGr *gr) {
  I64 texture,i,anim_cnt,x,y,c8;
  U8 name[9],buf[16],*row;
  U64 *r8;
  CDC *result,*patch;`,
    },
    {
      why: 'Texture composition: row scan',
      find: `    for(x=0;x!=result->width;x++)
      for(y=0;y!=result->height;y++) {
	if(GrPeek0(result,x,y)==TRANSPARENT)
	  goto fin;
      }`,
      replace: `//Eight pixels at a time: with c8 the complement of eight pixels,the test
//below is nonzero exactly when one of them is TRANSPARENT (0xFF).
    for(y=0;y!=result->height;y++) {
      row=result->body+y*result->width_internal;
      for(x=0;x+8<=result->width;x+=8) {
	r8=row+x;
	c8=~*r8;
	if((c8-0x0101010101010101)&~c8&0x8080808080808080)
	  goto fin;
      }
      for(;x<result->width;x++)
	if(row[x]==TRANSPARENT)
	  goto fin;
    }`,
    },
    {
      why: 'Level load: floor map by squares (four BSP walks per square of one leaf instead of 256)',
      find: `CDoomLevel *LoadWadLevel(U8 *level_name,I64 skill=1) {`,
      replace: `//Floor map builder. A BSP leaf is the intersection of the half planes on its
//path,so it is convex,and the side test is exact on integer map points. When
//the four corners of a square of grid points land in one leaf,every point of
//the square does,and growing the leaf box by the square once is the same as
//growing it point by point.
U0 FloorMapGrow(CDoomBSPNode *node,CDoomSubsector *ss,F64 x,F64 y,F64 x2,F64 y2) {
  CBoundBoxF64 *bbox;
  if(ss==node->left_child)
    bbox=&node->left;
  else
    bbox=&node->right;
  if(bbox->x>bbox->x2) {
    bbox->x=Max(bbox->x,x2);
    bbox->x2=Min(bbox->x2,x);
  } else {
    bbox->x2=Max(bbox->x2,x2);
    bbox->x=Min(bbox->x,x);
  }
  if(bbox->y>bbox->y2) {
    bbox->y=Max(bbox->y,y2);
    bbox->y2=Min(bbox->y2,y);
  } else {
    bbox->y2=Max(bbox->y2,y2);
    bbox->y=Min(bbox->y,y);
  }
}
U0 FloorMapSquare(CDoomLevel *level,F64 x,F64 y,I64 n,CDoomBSPNode *cell_node,CDoomSubsector *cell_ss,Bool *passes) {
  CDoomBSPNode *n0,*n1,*n2,*n3;
  CDoomSubsector *s0,*s1,*s2,*s3;
  I64 half;
  n0=DoomWhichBSPNode(x,y,level,&s0);
  if(n==1) {
    if(n0!=cell_node||s0!=cell_ss)
      *passes=FALSE;
    if(s0&&n0)
      FloorMapGrow(n0,s0,x,y,x,y);
    return;
  }
  n1=DoomWhichBSPNode(x+n-1,y,level,&s1);
  n2=DoomWhichBSPNode(x,y+n-1,level,&s2);
  n3=DoomWhichBSPNode(x+n-1,y+n-1,level,&s3);
  if(n0==n1&&n0==n2&&n0==n3&&s0==s1&&s0==s2&&s0==s3) {
    if(n0!=cell_node||s0!=cell_ss)
      *passes=FALSE;
    if(s0&&n0)
      FloorMapGrow(n0,s0,x,y,x+n-1,y+n-1);
    return;
  }
  *passes=FALSE;
  half=n/2;
  FloorMapSquare(level,x,y,half,cell_node,cell_ss,passes);
  FloorMapSquare(level,x+half,y,half,cell_node,cell_ss,passes);
  FloorMapSquare(level,x,y+half,half,cell_node,cell_ss,passes);
  FloorMapSquare(level,x+half,y+half,half,cell_node,cell_ss,passes);
}
CDoomLevel *LoadWadLevel(U8 *level_name,I64 skill=1) {`,
    },
    {
      why: 'Level load: floor map loop',
      find: `      dnode=DoomWhichBSPNode(minx+x*16+4,miny+y*16+4,level,&dss);
      passes=TRUE;
      for(x2=0;x2!=16;x2++)
        for(y2=0;y2!=16;y2++) {
	  dnode2=DoomWhichBSPNode(minx+x*16+x2,miny+y*16+y2,level,&dss2);
	  if(dnode!=dnode2) {
	    passes=FALSE;
	  }
	  if(dss!=dss2)\t
	   passes=FALSE;
	  if(dss2&&dnode2) {
	     if(dss2==dnode2->left_child) {
		bbox=&dnode2->left;
	     } else {
		bbox=&dnode2->right;
	     }
//Adjust "real" bounds box
	     if(bbox->x>bbox->x2) {
		bbox->x=Max(bbox->x,minx+x*16+x2);
		bbox->x2=Min(bbox->x2,minx+x*16+x2);
	     } else {
		bbox->x2=Max(bbox->x2,minx+x*16+x2);
		bbox->x=Min(bbox->x,minx+x*16+x2);
	     }
	     if(bbox->y>bbox->y2) {
		bbox->y=Max(bbox->y,miny+y*16+y2);
		bbox->y2=Min(bbox->y2,miny+y*16+y2);
	     } else {
		bbox->y2=Max(bbox->y2,miny+y*16+y2);
		bbox->y=Min(bbox->y,miny+y*16+y2);
	     }
	  }
        }`,
      replace: `      dnode=DoomWhichBSPNode(minx+x*16+4,miny+y*16+4,level,&dss);
      passes=TRUE;
      FloorMapSquare(level,minx+x*16,miny+y*16,16,dnode,dss,&passes);`,
    },
    {
      why: 'Lump lookup: compare the first letter before calling StrCmp8 (it can only match when they agree)',
      find: `	if (!StrCmp8(lump_p->lump_name,name8))`,
      replace: `	if (lump_p->lump_name[0]==name8[0]&&!StrCmp8(lump_p->lump_name,name8))`,
    },
    {
      why: 'Texture composition: copy patch pixels with direct stores (same clipping and bytes as GrBlot)',
      find: `U0 LoadWadTEXTUREs(CWadTEXTURE1 *header,CDoomGr *gr) {`,
      replace: `//GrBlot of an image with transparent pixels onto a DC that is not the screen
//and has no extents,locate,don't draw or on top flag (the only DC flags GrBlot
//and GrPlot0 read),with the plain EQU raster op and no probability dither,
//takes its transparent pixel path: it hides the depth buffer,clips as below,
//stores each pixel that is not TRANSPARENT with GrPlot0,and puts the color
//and depth buffer back. Anything else goes to GrBlot. Eight pixels at a time: with c the complement of eight pixels,the
//test below is zero exactly when none of them is TRANSPARENT (0xFF).
U0 TextureBlot(CDC *dc,I64 x,I64 y,CDC *img) {
  I64 i,j,k,c,w1=0,h1=0,w2=img->width,h2=img->height;
  U64 *s8,*d8;
  U8 *src,*dst;
  if(img->flags&DCF_NO_TRANSPARENTS||dc->flags&(DCF_SCRN_BITMAP|
	DCF_LOCATE_NEAREST|DCF_RECORD_EXTENTS|DCF_DONT_DRAW|DCF_ON_TOP)||
	dc->color&(0xFF00|ROPF_PROBABILITY_DITHER)) {
    GrBlot(dc,x,y,img);
    return;
  }
  if(x<0)
    w1=-x;
  if(y<0)
    h1=-y;
  if(x+w2>dc->width)
    w2=dc->width-x;
  if(y+h2>dc->height)
    h2=dc->height-y;
  if(w1<w2<=img->width&&h1<h2<=img->height)
    for(j=h1;j<h2;j++) {
      src=img->body+j*img->width_internal;
      dst=dc->body+(y+j)*dc->width_internal+x;
      for(i=w1;i+8<=w2;i+=8) {
	s8=src+i;
	c=~*s8;
	if(!((c-0x0101010101010101)&~c&0x8080808080808080)) {
	  d8=dst+i;
	  *d8=*s8;
	} else if(c) {
	  for(k=i;k!=i+8;k++)
	    if((c=src[k])!=TRANSPARENT)
	      dst[k]=c;
	}
      }
      for(;i<w2;i++)
	if((c=src[i])!=TRANSPARENT)
	  dst[i]=c;
    }
}
U0 LoadWadTEXTUREs(CWadTEXTURE1 *header,CDoomGr *gr) {`,
    },
    {
      why: 'Texture composition: use TextureBlot',
      find: `      GrBlot(result,
	map_texture->patches[i].origin_x*2,`,
      replace: `      TextureBlot(result,
	map_texture->patches[i].origin_x*2,`,
    },
  ],
  'ST.HC': [
    {
      why: 'Status bar: blit its pictures with TextureBlot (the same pixels as GrBlot,which it calls for any other case)',
      find: `GrBlot(doom_scrn,`,
      replace: `TextureBlot(doom_scrn,`,
      count: 11,
    },
  ],
  'MainDrawer.HC': [
    {
      why: 'Flats: skip columns whose ray cannot reach the subsector box before the four PlaneIntersect calls',
      find: `  for(x=minx-2;x<maxx+2;x+=2) {
    F64 worst,best;
    if(!RayPassesThroughBox(bbox,&cam->x,cos_table[x],sin_table[x],&best,&worst))
       goto nextx;`,
      replace: `//RayPassesThroughBox only passes a column if an intersection lies within its
//tolerance (at most 1) of the box,within 2 of the true ray line (its near
//vertical shortcut) and no more than 1 behind the camera on the ray's main
//axis. So a column whose ray line clears every box corner by more than 4 on
//one side,or that sees every corner more than 8 behind the camera,fails it:
//skip the four PlaneIntersect calls for it.
  F64 bx0=bbox->x-cam->x,bx1=bbox->x2-cam->x,by0=bbox->y-cam->y,by1=bbox->y2-cam->y;
  F64 rc,rs,p0,p1,p2,p3,rcos,cut1,cut2;
  I64 ystep;
  for(x=minx-2;x<maxx+2;x+=2) {
    F64 worst,best;
    rc=cos_table[x];
    rs=sin_table[x];
    p0=rc*by0-rs*bx0;
    p1=rc*by0-rs*bx1;
    p2=rc*by1-rs*bx0;
    p3=rc*by1-rs*bx1;
    if(p0>4.&&p1>4.&&p2>4.&&p3>4.)
      goto nextx;
    if(p0<-4.&&p1<-4.&&p2<-4.&&p3<-4.)
      goto nextx;
    if(rc*bx0+rs*by0<-8.&&rc*bx1+rs*by0<-8.&&
	  rc*bx0+rs*by1<-8.&&rc*bx1+rs*by1<-8.)
      goto nextx;
    if(!RayPassesThroughBox(bbox,&cam->x,cos_table[x],sin_table[x],&best,&worst))
       goto nextx;`,
    },
    {
      why: 'Flats: load the per column values once and step y without calling Sign',
      find: `    for(;y!=cap;y+=Sign(cap-y)*2) {
      dist=DIST_SCALE/(ToF64(y-GR_HEIGHT/2)/(cam->h-level));
      dist/=ray_cast_table_cos[ToI64(x)>>1];
      if(floor) {
	if(dist>2+cam->floor_cutoffs[ToI64(x)>>1]) {
	  break;
	}
      } else {
	if(dist>2+cam->ceil_cutoffs[ToI64(x)>>1]) {
	  break;
	}
      }
      if(dist>2+cam->cutoff_dists[ToI64(x)>>1]) {
        break;
      }
      wyf=cam->y+dist*sin_table[ToI64(x)];
      wxf=cam->x+dist*cos_table[ToI64(x)];`,
      replace: `//y and cap are both even,so y walks onto cap: the step never changes.
    if(cap>y)
      ystep=2;
    else
      ystep=-2;
    rcos=ray_cast_table_cos[x>>1];
    if(floor)
      cut1=cam->floor_cutoffs[x>>1];
    else
      cut1=cam->ceil_cutoffs[x>>1];
    cut2=cam->cutoff_dists[x>>1];
    for(;y!=cap;y+=ystep) {
      dist=DIST_SCALE/(ToF64(y-GR_HEIGHT/2)/(cam->h-level));
      dist/=rcos;
      if(dist>2+cut1)
	break;
      if(dist>2+cut2)
        break;
      wyf=cam->y+dist*rs;
      wxf=cam->x+dist*rc;`,
    },
    {
      why: 'Floor pixels: LookupLighting inline',
      find: `  U64 color=LookupLighting(texture->body[wx+wy*128](U16),light,idist&U32_MAX,god_mode);`,
      replace: `  I64 dith=texture->body[wx+wy*128](U16);
  F64 distance=idist&U32_MAX;
  U64 color;
  if(dith&0xff==TRANSPARENT)
    color=0xffffffff;
  else {
    light=light-distance*1/16.;
    if(light<15)
      light=15;
    else if(light>255)
      light=255;
    dith=(dith&0xf)|(dith>>(8-4));
    if(god_mode)
      color=godmode_mat[dith];
    else
      color=light_mat[dith][light>>4];
  }`,
    },
    {
      why: 'Wall pixels: per column values loaded once,LookupLighting and ClampI64 inline',
      find: `	  for(ih2=low_ih;TRUE;ih2+=2,tyf+=2*ratio*2) { //2 for dither pixel,2 for ih2+=2
	    if(ih2>=ih||ih2+iy>=GR_HEIGHT-2)
	      break;
	    if(iy+ih2<0) {
	      skip=-iy;
	      tyf+=2*ratio*(skip-2); // *2 for dither super pixel
	      ih2+=skip-2;
	      goto skip_p;
	    }
	    db_z=&to_dc->depth_buf[GR_WIDTH-2-ix+(iy+ih2)*to_dc->width_internal];
	    if(*db_z>idist) {
	      ty=tyf;
	      if(repeat)
	        ty=ty%texture->height;
	      if(ty<0) ty=-ty;
	      ty=ClampI64(ty,0,texture->height-2);
//Avoids Templeos bug with &=~1;
	      ty=ty&~1;
	      color=texture->body[tx+ty*texture->width_internal](U16);
	      dither_px=LookupLighting(color,light,dist,god_mode);
	      to=&to_dc->body[GR_WIDTH-2-ix+(iy+ih2)*to_dc->width_internal];
	      if(color&0xff!=TRANSPARENT) {
	        ld->seen=TRUE;
	        db_z[0]=idist;
	        db_z[1]=idist;
	        db_z+=to_dc->width_internal;
	        db_z[0]=idist;
	        db_z[1]=idist;
	        *to=dither_px&0xffff;
	        to(U8*)+=to_dc->width_internal;
	        *to=dither_px>>16;
	      }
	    }
skip_p:;
	  }`,
      replace: `//The light row,the texture column and the row bases are the same for the
//whole column. 2*ratio*2 is 4*ratio exactly,so the step can be stored once.
	  I64 lrow,c16,twi,th2,dwi,lim;
	  U8 *tb,*tobase;
	  I32 *dbase;
	  F64 tstep;
	  lrow=light-dist*1/16.;
	  if(lrow<15)
	    lrow=15;
	  else if(lrow>255)
	    lrow=255;
	  lrow>>=4;
	  twi=texture->width_internal;
	  th2=texture->height-2;
	  dwi=to_dc->width_internal;
	  tb=texture->body+tx;
	  dbase=&to_dc->depth_buf[GR_WIDTH-2-ix+iy*dwi];
	  tobase=&to_dc->body[GR_WIDTH-2-ix+iy*dwi];
	  lim=GR_HEIGHT-2-iy;
	  if(ih<lim)
	    lim=ih;
	  tstep=2*ratio*2;
	  for(ih2=low_ih;TRUE;ih2+=2,tyf+=tstep) { //2 for dither pixel,2 for ih2+=2
	    if(ih2>=lim)
	      break;
	    if(iy+ih2<0) {
	      skip=-iy;
	      tyf+=2*ratio*(skip-2); // *2 for dither super pixel
	      ih2+=skip-2;
	      goto skip_p;
	    }
	    db_z=&dbase[ih2*dwi];
	    if(*db_z>idist) {
	      ty=tyf;
	      if(repeat)
	        ty=ty%texture->height;
	      if(ty<0) ty=-ty;
//ClampI64(ty,0,texture->height-2),in its order
	      if(ty<0) ty=0;
	      if(ty>th2) ty=th2;
//Avoids Templeos bug with &=~1;
	      ty=ty&~1;
	      color=tb[ty*twi](U16);
	      c16=color;
	      if(c16&0xff!=TRANSPARENT) {
	        if(god_mode)
	          dither_px=godmode_mat[(c16&0xf)|(c16>>(8-4))];
	        else
	          dither_px=light_mat[(c16&0xf)|(c16>>(8-4))][lrow];
	        to=&tobase[ih2*dwi];
	        ld->seen=TRUE;
	        db_z[0]=idist;
	        db_z[1]=idist;
	        db_z+=dwi;
	        db_z[0]=idist;
	        db_z[1]=idist;
	        *to=dither_px&0xffff;
	        to(U8*)+=dwi;
	        *to=dither_px>>16;
	      }
	    }
skip_p:;
	  }`,
    },
  ],
};

// Apply the edits for one file; throws when a token is missing or not unique.
export function applyToomSpeed(name, text) {
  for (const e of toomSpeed[name] || []) {
    const n = text.split(e.find).length - 1;
    const want = e.count || 1;
    if (n !== want) throw new Error(`Review changed TOOM speed edit in ${name} (${e.why}): found ${n} times, expected ${want}`);
    text = text.split(e.find).join(e.replace);
  }
  return text;
}
