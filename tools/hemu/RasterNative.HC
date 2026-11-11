#define RASTER_CASE_NUM 200
#define RASTER_VALUE_NUM 11

U64 raster_res[RASTER_CASE_NUM*RASTER_VALUE_NUM];
I64 raster_cnt;

U64 RasterHash(U8 *src,I64 cnt)
{//Hash all storage bytes, including untouched row padding.
  U64 res=0xCBF29CE484222325;
  while (cnt--) {
    res^=*src++;
    res*=0x100000001B3;
  }
  return res;
}

U0 RasterNative()
{//Original GrHLine/GrVLine, with deterministic probability dither.
  I64 shape,vert,big,mode,test,i,n,size,x1,x2,cnt,res,*dst;
  U64 colors[5],old_seed=Fs->rand_seed,old_flags=Fs->task_flags;
  CD3I32 poly[3];
  CDC *dc;
  colors[0]=12;colors[1]=0x10C;colors[2]=0x20C;
  colors[3]=0x4004000C;colors[4]=0x8004000C;
  raster_cnt=0;
  Bts(&Fs->task_flags,TASKf_NONTIMER_RAND);
  for (shape=0;shape<2;shape++)
    for (vert=0;vert<2;vert++)
      for (big=0;big<2;big++) {
	n=64;
	if (big) n=5000;
	if (vert) dc=DCNew(1,n);
	else dc=DCNew(n,1);
	size=dc->width_internal*dc->height;
	dc->depth_buf=MAlloc(size*4);
	for (mode=0;mode<5;mode++)
	  for (test=0;test<5;test++) {
	    MemSet(dc->body,7,size);
	    for (i=0;i<size;i++) dc->depth_buf[i]=I32_MAX;
	    dc->color=colors[mode];dc->bkcolor=BLACK;
	    dc->dither_probability_u16=25123;
	    dc->flags=DCF_RECORD_EXTENTS|DCF_LOCATE_NEAREST;
	    dc->min_x=dc->min_y=I64_MAX;
	    dc->max_x=dc->max_y=I64_MIN;
	    dc->cur_x=dc->cur_y=17;
	    dc->nearest_dist=I64_MAX;dc->collision_cnt=0;
	    x1=0;x2=n-1;
	    switch (test) {
	      case 1:
		SwapI64(&x1,&x2);
		break;
	      case 2:
		x1=-20;x2=n+31;
		break;
	      case 3:
		x1=-30;x2=-5;
		break;
	      case 4:
		dc->flags|=DCF_DONT_DRAW;
		break;
	    }
	    Fs->rand_seed=0x123456789ABCDEF0;
	    if (shape) {
	      poly[0].x=x1;poly[0].y=0;poly[0].z=40;
	      poly[1].x=x2;poly[1].y=0;poly[1].z=1400;
	      poly[2].x=x2;poly[2].y=1;poly[2].z=2000;
	      if (vert)
		for (i=0;i<3;i++) {
		  cnt=poly[i].x;poly[i].x=poly[i].y;
		  poly[i].y=cnt;
		}
	      res=GrFillPoly3(dc,3,poly);
	    } else if (vert) res=GrVLine(dc,0,x1,x2,40,1400);
	    else res=GrHLine(dc,x1,x2,0,40,1400);
	    dst=&raster_res[raster_cnt*RASTER_VALUE_NUM];
	    *dst++=raster_cnt++;*dst++=res;*dst++=Fs->rand_seed;
	    *dst++=RasterHash(dc->body,size);
	    *dst++=RasterHash(dc->depth_buf,size*4);
	    *dst++=dc->collision_cnt;*dst++=dc->nearest_dist;
	    *dst++=dc->min_x;*dst++=dc->max_x;
	    *dst++=dc->min_y;*dst++=dc->max_y;
	  }
	DCDel(dc);
      }
  Fs->rand_seed=old_seed;Fs->task_flags=old_flags;
  for (i=0;i<raster_cnt;i++) {
    dst=&raster_res[i*RASTER_VALUE_NUM];
    for (cnt=0;cnt<RASTER_VALUE_NUM;cnt++)
      "%016X ",*dst++;
    '\n';
  }
}

RasterNative;
