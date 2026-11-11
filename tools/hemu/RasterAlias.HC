#define ALIAS_CASE_NUM 30
#define ALIAS_VALUE_NUM 7

U64 alias_res[ALIAS_CASE_NUM*ALIAS_VALUE_NUM];
I64 alias_cnt;

U64 AliasHash(U8 *src,I64 cnt)
{//Include untouched bytes after partially rejected spans.
  U64 res=0xCBF29CE484222325;
  while (cnt--) {
    res^=*src++;
    res*=0x100000001B3;
  }
  return res;
}

U0 RasterAlias()
{//Native probability dither may write the state that it reads next.
  I64 mode,test,vert,i,j,res,n,*dst;
  U64 old_seed=Fs->rand_seed,old_flags=Fs->task_flags;
  U8 *body;
  I32 *depth;
  CDC *dc;
  alias_cnt=0;
  Bts(&Fs->task_flags,TASKf_NONTIMER_RAND);
  for (vert=0;vert<2;vert++)
    for (mode=0;mode<3;mode++)
      for (test=0;test<5;test++) {
	n=8;
	if (test==2 || test==3) n=2;
	if (vert) dc=DCNew(1,n);
	else dc=DCNew(n,1);
	body=dc->body;
	depth=dc->depth_buf=MAlloc(dc->width_internal*dc->height*4);
	MemSet(body,7,dc->width_internal*dc->height);
	for (i=0;i<dc->width_internal*dc->height;i++) depth[i]=I32_MAX;
	dc->color=0x8004000C|mode<<8;
	dc->bkcolor=BLACK;dc->dither_probability_u16=25123;
	Fs->rand_seed=0x123456789ABCDEF0;
	switch (test) {
	  case 0: dc->body=&Fs->rand_seed;break;
	  case 1: dc->body=&dc->dither_probability_u16;break;
	  case 2: dc->depth_buf=&Fs->rand_seed;break;
	  case 3: dc->depth_buf=&dc->dither_probability_u16;break;
	  case 4: dc->body=dc->depth_buf;break;
	}
	//Use one-byte vertical stride to keep aliases inside eight bytes.
	if (vert) dc->width_internal=1;
	if (vert) res=GrVLine(dc,0,0,n-1,40,1400);
	else res=GrHLine(dc,0,n-1,0,40,1400);
	dst=&alias_res[alias_cnt*ALIAS_VALUE_NUM];
	*dst++=alias_cnt++;*dst++=res;*dst++=Fs->rand_seed;
	*dst++=AliasHash(dc->body,n);
	*dst++=AliasHash(dc->depth_buf,n*4);
	*dst++=dc->collision_cnt;*dst++=dc->dither_probability_u16;
	dc->body=body;dc->depth_buf=depth;DCDel(dc);
      }
  Fs->rand_seed=old_seed;Fs->task_flags=old_flags;
  for (i=0;i<alias_cnt;i++) {
    dst=&alias_res[i*ALIAS_VALUE_NUM];
    for (j=0;j<ALIAS_VALUE_NUM;j++) "%016X ",*dst++;
    '\n';
  }
}

RasterAlias;
