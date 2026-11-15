//Oklab: https://bottosson.github.io/posts/oklab/ (public domain).
#include "Noise"

U8 sprite_palette[16][3];
F64 sprite_linear[16][3],sprite_lab[16][3],sprite_srgb[256],
      sprite_display[16][3],sprite_chroma[16][3],sprite_sat[16],
      sprite_luma[16],*sprite_weights=NULL,sprite_strength=-1;
U32 sprite_mixes[32768];
Bool sprite_colors_ready=FALSE;

F64 SpriteLinear(F64 value)
{
  value/=255;
  if (value<=0.04045) return value/12.92;
  return Pow((value+0.055)/1.055,2.4);
}

F64 SpriteCubeRoot(F64 value)
{//Diffusion can carry negative linear-light components.
  if (value<0) return -Pow(-value,1.0/3);
  return Pow(value,1.0/3);
}

U0 SpriteLab(F64 *rgb,F64 *res)
{
  F64 l=SpriteCubeRoot(0.4122214708*rgb[0]+0.5363325363*rgb[1]+
	0.0514459929*rgb[2]),
      m=SpriteCubeRoot(0.2119034982*rgb[0]+0.6806995451*rgb[1]+
	0.1073969566*rgb[2]),
      s=SpriteCubeRoot(0.0883024619*rgb[0]+0.2817188376*rgb[1]+
	0.6299787005*rgb[2]);
  res[0]=0.2104542553*l+0.793617785*m-0.0040720468*s;
  res[1]=1.9779984951*l-2.428592205*m+0.4505937099*s;
  res[2]=0.0259040371*l+0.7827717662*m-0.808675766*s;
}

I64 SpriteEven(F64 value)
{//Uint8ClampedArray and float32 use ties to even, unlike Math.round.
  I64 n=Floor(value);
  F64 rest=value-n;
  if (rest>0.5 || rest==0.5 && n&1) n++;
  return n;
}

F64 SpriteFloat32(F64 value)
{//Round positive smoothing weights to binary32, retained as F64.
  U64 bits=value(U64);
  if (value<1.1754943508222875e-38)
    return SpriteEven(value/1.401298464324817e-45)*
	1.401298464324817e-45;
  bits+=0xFFFFFFF+bits>>29&1;
  bits&=~0x1FFFFFFF;
  return bits(F64);
}

U0 SpriteColorsInit()
{
  I64 i,k;
  F64 mean;
  if (sprite_colors_ready) return;
  for (i=0;i<256;i++) sprite_srgb[i]=SpriteLinear(i);
  for (i=0;i<16;i++) {
    sprite_palette[i][0]=gr_palette_std[i].r>>8;
    sprite_palette[i][1]=gr_palette_std[i].g>>8;
    sprite_palette[i][2]=gr_palette_std[i].b>>8;
    mean=0;
    for (k=0;k<3;k++) {
      sprite_linear[i][k]=sprite_srgb[sprite_palette[i][k]];
      sprite_display[i][k]=sprite_palette[i][k]/255.0;
      mean+=sprite_display[i][k];
    }
    SpriteLab(sprite_linear[i],sprite_lab[i]);
    mean/=3;
    for (k=0;k<3;k++)
      sprite_chroma[i][k]=sprite_display[i][k]-mean;
    sprite_sat[i]=Sqrt(Sqr(sprite_chroma[i][0])+
	Sqr(sprite_chroma[i][1])+Sqr(sprite_chroma[i][2]));
    sprite_luma[i]=0.2126*sprite_display[i][0]+
	0.7152*sprite_display[i][1]+0.0722*sprite_display[i][2];
  }
  sprite_colors_ready=TRUE;
}

I64 SpriteExact(U8 *rgb)
{
  I64 i;
  for (i=0;i<16;i++)
    if (rgb[0]==sprite_palette[i][0] &&
	rgb[1]==sprite_palette[i][1] && rgb[2]==sprite_palette[i][2])
      return i;
  return -1;
}

U8 *SpriteSoften(U8 *rgba,I64 width,I64 height,F64 alpha)
{
  U8 *res=NULL;
  I64 x,y,dx,dy,i,j,k,n,cnt,near,tmp,neighbors[9],sorted[9],median[3];
  F64 sums[3],weight,total,*weights=NULL;
  Bool outlier;
  try {
    res=MAlloc(width*height*4);
    if (!sprite_weights) {
      weights=MAlloc((3*255*255+1)*sizeof(F64));
      for (i=0;i<=3*255*255;i++)
	weights[i]=SpriteFloat32(Exp(-i/1250.0));
      sprite_weights=weights;weights=NULL;
    }
    MemCpy(res,rgba,width*height*4);
    for (y=0;y<height;y++)
      for (x=0;x<width;x++) {
	i=(y*width+x)*4;
	if (rgba[i+3]<alpha || SpriteExact(rgba+i)>=0) goto ss_next;
	cnt=0;
	for (dy=-1;dy<=1;dy++)
	  for (dx=-1;dx<=1;dx++)
	    if (0<=x+dx<width && 0<=y+dy<height) {
	      j=((y+dy)*width+x+dx)*4;
	      if (rgba[j+3]>=alpha) neighbors[cnt++]=j;
	    }
	if (cnt>=6) {
	  outlier=FALSE;
	  for (k=0;k<3;k++) {
	    for (n=0;n<cnt;n++) {
	      tmp=rgba[neighbors[n]+k];j=n;
	      while (j && sorted[j-1]>tmp) {
		sorted[j]=sorted[j-1];j--;
	      }
	      sorted[j]=tmp;
	    }
	    median[k]=sorted[cnt>>1];
	    if (AbsI64(rgba[i+k]-median[k])>45) outlier=TRUE;
	  }
	  near=0;
	  for (n=0;n<cnt;n++)
	    if (AbsI64(rgba[neighbors[n]]-median[0])<=30 &&
		AbsI64(rgba[neighbors[n]+1]-median[1])<=30 &&
		AbsI64(rgba[neighbors[n]+2]-median[2])<=30) near++;
	  if (near>=5 && outlier) {
	    for (k=0;k<3;k++) res[i+k]=median[k];
	    goto ss_next;
	  }
	}
	for (k=0;k<3;k++) sums[k]=2*rgba[i+k];
	total=2;
	for (dy=-1;dy<=1;dy++)
	  for (dx=-1;dx<=1;dx++)
	    if ((dx || dy) && 0<=x+dx<width && 0<=y+dy<height) {
	      j=((y+dy)*width+x+dx)*4;
	      if (rgba[j+3]>=alpha) {
		n=SqrI64(rgba[i]-rgba[j])+SqrI64(rgba[i+1]-rgba[j+1])+
		    SqrI64(rgba[i+2]-rgba[j+2]);
		weight=sprite_weights[n];
		for (k=0;k<3;k++) sums[k]+=rgba[j+k]*weight;
		total+=weight;
	      }
	    }
	for (k=0;k<3;k++) res[i+k]=SpriteEven(sums[k]/total);
ss_next:
      }
  } catch {
    Free(res);Free(weights);
  }
  return res;
}

F64 SpriteDist(F64 *a,F64 *b)
{
  return Sqr(a[0]-b[0])+Sqr(a[1]-b[1])+Sqr(a[2]-b[2]);
}

U0 SpriteChoose(F64 cost,F64 *score,I64 *packed,
      I64 a,I64 b,I64 c,I64 na,I64 nb)
{
  if (cost<*score-1e-10) {
    *score=cost;
    *packed=a|b<<4|c<<8|na<<12|nb<<21;
  }
}

U32 SpriteMixture(U8 *src,F64 strength)
{
  I64 key=src[0]>>3<<10|src[1]>>3<<5|src[2]>>3,
      a,b,c,k,na,nb,nc,packed=0;
  F64 rgb[3],tint[3],alignment[16],u[3],v[3],mean[3],*p,
      mag,avg=0,hue=0.7,value,saturation,penalty,score=1e300,
      uu,ru,vv,uv,rv,det,tb,tc,wa,wb,wc,variance;
  Bool allowed[16];
  if (sprite_strength!=strength) {
    MemSet(sprite_mixes,0,sizeof(sprite_mixes));
    sprite_strength=strength;
  }
  if (sprite_mixes[key]) return sprite_mixes[key]-1;
  for (k=0;k<3;k++) {
    rgb[k]=(src[k]&248+4)/255.0;avg+=rgb[k];
  }
  avg/=3;
  for (k=0;k<3;k++) tint[k]=rgb[k]-avg;
  mag=Sqrt(Sqr(tint[0])+Sqr(tint[1])+Sqr(tint[2]));
  for (a=0;a<16;a++) {
    alignment[a]=0;
    if (mag>1e-9 && sprite_sat[a]) {
      for (k=0;k<3;k++)
	alignment[a]+=sprite_chroma[a][k]*tint[k];
      alignment[a]/=mag*sprite_sat[a];
    }
    hue=Max(hue,alignment[a]-0.08);
  }
  value=Max(rgb[0],Max(rgb[1],rgb[2]));
  saturation=(value-Min(rgb[0],Min(rgb[1],rgb[2])))/value;
  for (a=0;a<16;a++)
    allowed[a]=a==0 || a==7 || a==8 || a==15 ||
	mag>0.015 && alignment[a]>=hue &&
	(a<9 || a==12 || saturation>=0.35) && (a!=10 || src[1]>=230);
  penalty=Pow(1-strength/100,4);
  for (a=0;a<16;a++) if (allowed[a]) {
    p=sprite_display[a];
    SpriteChoose(SpriteDist(rgb,p),&score,&packed,a,0,0,256,0);
    if (!strength) goto sm_next;
    for (b=a+1;b<16;b++)
      if (allowed[b] && Abs(sprite_luma[a]-sprite_luma[b])<0.6) {
	uu=ru=0;
	for (k=0;k<3;k++) {
	  u[k]=sprite_display[b][k]-p[k];
	  uu+=u[k]*u[k];ru+=(rgb[k]-p[k])*u[k];
	}
	nb=Floor(Clamp(ru/uu,0,1)*256+0.5);wb=nb/256.0;
	if (0<nb<256) {
	  for (k=0;k<3;k++) mean[k]=p[k]+wb*u[k];
	  SpriteChoose(SpriteDist(rgb,mean)+penalty*wb*(1-wb)*uu,
	      &score,&packed,a,b,0,256-nb,nb);
	}
	for (c=b+1;c<16;c++)
	  if (allowed[c] && Max(sprite_luma[a],
	      Max(sprite_luma[b],sprite_luma[c]))-Min(sprite_luma[a],
	      Min(sprite_luma[b],sprite_luma[c]))<0.6) {
	    vv=uv=rv=0;
	    for (k=0;k<3;k++) {
	      v[k]=sprite_display[c][k]-p[k];
	      vv+=v[k]*v[k];uv+=u[k]*v[k];rv+=(rgb[k]-p[k])*v[k];
	    }
	    det=uu*vv-uv*uv;
	    if (det<1e-9) goto sm_tri_next;
	    tb=(ru*vv-rv*uv)/det;tc=(rv*uu-ru*uv)/det;
	    if (tb<=0 || tc<=0 || tb+tc>=1) goto sm_tri_next;
	    nb=Floor(tb*256+0.5);nc=Floor(tc*256+0.5);na=256-nb-nc;
	    if (na<=0 || nb<=0 || nc<=0) goto sm_tri_next;
	    wa=na/256.0;wb=nb/256.0;wc=nc/256.0;
	    for (k=0;k<3;k++) mean[k]=p[k]+wb*u[k]+wc*v[k];
	    variance=wa*wb*uu+wa*wc*vv+
		wb*wc*SpriteDist(sprite_display[b],sprite_display[c]);
	    SpriteChoose(SpriteDist(rgb,mean)+penalty*variance,
		&score,&packed,a,b,c,na,nb);
sm_tri_next:
	  }
      }
sm_next:
  }
  sprite_mixes[key]=packed+1;
  return packed;
}

public U8 *SpriteQuantize(U8 *rgba,I64 cnt,I64 width,I64 height,
      I64 mode,F64 alpha,F64 strength)
{
  I64 x,y,n,i,j,k,c,step,best,na,nb,threshold,mix,
	row_size=(width+2)*24;
  F64 rgb[3],target[3],score,d,error,*row=NULL,*next=NULL,*tmp;
  U8 *res=NULL,*src=NULL;
  sprite_gr_error=NULL;
  if (!SpriteGrStride(width,height)) return NULL;
  if (cnt!=width*height*4) {
    sprite_gr_error="Invalid RGBA frame length.";return NULL;
  }
  if (mode==2 && !(0<=strength<=100)) {
    sprite_gr_error="Dither strength must be between 0 and 100.";
    return NULL;
  }
  SpriteColorsInit;
  try {
    res=MAlloc(width*height);
    if (mode==2) src=SpriteSoften(rgba,width,height,alpha);
    if (mode==1) {
      row=CAlloc(row_size);next=CAlloc(row_size);
    }
    for (y=0;y<height;y++) {
      step=1;x=0;
      if (mode==1 && y&1) {step=-1;x=width-1;}
      while (0<=x<width) {
	n=y*width+x;i=n*4;j=(x+1)*3;
	if (rgba[i+3]<alpha) {res[n]=TRANSPARENT;goto sq_next;}
	if (mode==2) {
	  best=SpriteExact(rgba+i);
	  if (best<0) {
	    mix=SpriteMixture(src+i,strength);
	    threshold=sprite_noise[y%64*64+x%64];
	    na=mix>>12&511;nb=mix>>21&511;
	    if (threshold<na) best=mix&15;
	    else if (threshold<na+nb) best=mix>>4&15;
	    else best=mix>>8&15;
	  }
	} else {
	  score=1e300;best=0;
	  if (mode==1) {
	    for (k=0;k<3;k++) rgb[k]=sprite_srgb[rgba[i+k]]+row[j+k];
	    SpriteLab(rgb,target);
	  }
	  for (c=0;c<16;c++) {
	    if (mode==1)
	      d=Sqr(target[0]-sprite_lab[c][0])+
		  2*(Sqr(target[1]-sprite_lab[c][1])+
		  Sqr(target[2]-sprite_lab[c][2]));
	    else
	      d=SqrI64(rgba[i]-sprite_palette[c][0])+
		  SqrI64(rgba[i+1]-sprite_palette[c][1])+
		  SqrI64(rgba[i+2]-sprite_palette[c][2]);
	    if (d<score) {best=c;score=d;}
	  }
	  if (mode==1)
	    for (k=0;k<3;k++) {
	      error=rgb[k]-sprite_linear[best][k];
	      row[j+step*3+k]+=error*7/16;
	      next[j-step*3+k]+=error*3/16;next[j+k]+=error*5/16;
	      next[j+step*3+k]+=error/16;
	    }
	}
	res[n]=best;
sq_next:
	x+=step;
      }
      if (mode==1) {
	tmp=row;row=next;next=tmp;MemSet(next,0,row_size);
      }
    }
  } catch {
    Free(res);Free(src);Free(row);Free(next);
  }
  Free(src);Free(row);Free(next);
  return res;
}

public U8 *SpriteRGBA(U8 *src,I64 cnt,I64 width,I64 height)
{
  U8 *res;
  I64 i;
  sprite_gr_error=NULL;
  if (!SpriteGrStride(width,height)) return NULL;
  if (cnt!=width*height) {
    sprite_gr_error="Invalid indexed frame length.";return NULL;
  }
  for (i=0;i<cnt;i++)
    if (src[i]>15 && src[i]!=TRANSPARENT) {
      sprite_gr_error="Invalid TempleOS palette index.";return NULL;
    }
  SpriteColorsInit;
  res=CAlloc(cnt*4);
  for (i=0;i<cnt;i++)
    if (src[i]!=TRANSPARENT) {
      MemCpy(res+i*4,sprite_palette[src[i]],3);res[i*4+3]=255;
    }
  return res;
}
