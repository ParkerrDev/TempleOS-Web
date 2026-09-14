#define WEST_MAX	0
#define NORTH_MAX	0

#define DIR_IDLE	0
#define DIR_LEFT	1
#define DIR_RIGHT	2
#define DIR_UP		4
#define DIR_DOWN	8
#define DIR_ENTER       16
#define DIR_ESC         32
#define DIR_DEV         64
#define DIR_SHIFT       128

//by austin inspired by Alec Murphy
CDC* DCFlippedX(CDC* src){
  I64 x, y;
  CDC* dst = DCNew(src->width, src->height);
  for (y = 0; y < src->height; y++) {
   for (x = 0; x < src->width; x++) {
    dst->body[y * src->width_internal + x] =
    src->body[y * src->width_internal + (src->width - 1 - x)];
   }
  }
  return dst;
}

CDC *DCScaled(CDC* src, F64 scale_x, F64 scale_y) {
    if (scale_x <= 0 || scale_y <= 0) return NULL;

    I64 new_width = (I64)(src->width * scale_x);
    I64 new_height = (I64)(src->height * scale_y);
    CDC* dst = DCNew(new_width, new_height);

    I64 x, y;
    for (y = 0; y < new_height; y++) {
        for (x = 0; x < new_width; x++) {
            // Nearest-neighbor scaling
            I64 src_x = (I64)(x / scale_x);
            I64 src_y = (I64)(y / scale_y);

            // Clamp to source bounds
            if (src_x >= src->width) src_x = src->width - 1;
            if (src_y >= src->height) src_y = src->height - 1;

            dst->body[y * dst->width_internal + x] =
                src->body[src_y * src->width_internal + src_x];
        }
    }

    return dst;
}


/* StrSplit
  Date Created: 2025-06-20
  Author Name: M.A. Reyes
  Description: Adding Missing String Features from Latest Version of C
  
  God Bless to you all including Mr.Terry, TempleOS, HolyC and Jesus Christ
*/
U64 *StrSplit(U8 *str, U8 ch) { //Splitting using Delimiter from Single String
    I64 a=0,b=0,DLen;
        for(a=0;a<StrLen(str);a++) if(str[a]==ch) DLen++;

        U64 *p=MAlloc(DLen*sizeof(U8)), str1="";
        for(a=0;a<StrLen(str);a++) {
                if(str[a]==ch){
                        p[b]=str1;
                        str1="";
                        b++;
                }
                else str1=MStrPrint("%s%c",str1,str[a]);
        }

    return p;
}

U64 *OldStrSplit(U64 *str, U8 ch){ // Splitting using Delimiter from Single String into Array of String 
	U8 *p1=MAlloc(StrLen(str)*sizeof(U8));
	StrCpy(p1,str);
	//Find ch from CharArr through Loop
	I64 a,b=0,c=0,d=0;
	while(a<StrLen(p1)) {
		//If CharrArr is equal to ch
		if(p1[a]==ch) 
		          c++;
		
		a++;
	}
	c++;

	U64 *p2=MAlloc(c*sizeof(U64));
	U64 s="";
	
	a=0;
	while(a<StrLen(p1)){
		U8 *p3=CAlloc(2);
		p3[0]=p1[a];
		
		s=MStrPrint("%s%s",s,p3);
			
		if(p1[a]==ch){
			if(StrLen(s)!=0){
				b++;
				s="";
			}
		}
		p2[b]=s;
		
		a++;
	}
	//Checking for Empty String
	U64 *p4=MAlloc(b*sizeof(U64));
	a=0;
	while(a<b+1){
		if(StrLen(p2[a])!=0){
			p4[d]=p2[a];
			d++;
		}
		
		a++;
	}

	Free(p1);
	Free(p2);
	return p4;
}

//author austin
//key frame fetch pressed

I64 *DumpKey(U8 *_d,U8 *class_name=lastclass)
{
  CHashClass *tmpc=HashFind(class_name,Fs->hash_table,HTT_CLASS);
  I64 *q; 
  if (!tmpc) return 0;
  CMemberLst *ml;
  ml=tmpc->member_lst_and_root;
  while (ml) {
    q=_d+ml->offset;
    I64 ret = ToI64((*q));
    ml=ml->next;
    return ret;

  }
}
//device fetch
I64 GatherInputMsg(I64 arg1, I64 arg2)
{
 I64 msg_code=GetMsg(&arg1,&arg2,
      1<<MSG_KEY_DOWN|1<<MSG_MS_L_DOWN
      |1<<MSG_MS_L_UP|1<<MSG_MS_MOVE);

 return msg_code;
}

//dump hash @ index (slow)
Bool *DumpBoolIndex(I64 i,U8 *_d,U8 *class_name=lastclass)
{
  CHashClass *tmpc=HashFind(class_name,Fs->hash_table,HTT_CLASS);
  I64 *q; I64 check=0;
  if (!tmpc) return 0;
  CMemberLst *ml;
  ml=tmpc->member_lst_and_root;
  Bool* ret;
  while (check<i) {
    q=_d+ml->offset;
    //"%s",ml->str;
    ret=MemberMetaData("print_str",ml);
    ml=ml->next;
    check++;
  }
  return ret;
}


//data files fetch
//Rest of Original code by nrootconauto (Clayton Rhodes)

U8 *ReadALine(U8 **fbuf) {
  U8 *en,*st=*fbuf,*buf;
  if(!*st) return NULL;
  if(en=StrFirstOcc(st,"\n")) {
    buf=MAlloc(en-st+2);
    MemCpy(buf,st,en-st+1);
    buf[en-st+1]=0;
    *fbuf=en+1;
    return buf;
  }
  *fbuf+=StrLen(st);
  return StrNew(st);
}

U8 *ReadATextLine(U8 **fbuf) {
  U8 *en,*st=*fbuf,*buf;
  if(!*st) return NULL;
  if(en=StrFirstOcc(st,"\n")) {
    buf=MAlloc(en-st+2);
    MemCpy(buf,st,en-st+1);
    buf[en-st+1]=0;
    *fbuf=en+1;
    return buf;
  }
  *fbuf+=StrLen(st);
  return StrNew(st);
}


public I64 GrYoloFloodFill(CDC *dc=gr.dc,I64 x,I64 y,
	Bool not_color=FALSE,I64 z=0,I32 *db=NULL)
{//2D. Ignore z and db.
//not_color=TRUE means fill up to everything which is not the current color.
  //not_color=FALSE means fill all parts equ to the color under the point.
  //Returns cnt of pixs changed
  I64 res=0,j,old_flags=dc->flags;
  CColorROPU32 old_color2=dc->color2;
  CDC *old_brush;
  //if (dc->flags & DCF_DONT_DRAW) 
  //  return 0;
  old_brush=dc->brush;
  dc->brush=NULL;
  if ((j=GrPeek(dc,x,y))>=0) {
    if (not_color) {
      dc->color2=dc->color.c0.color;
      dc->flags|=DCF_FILL_NOT_COLOR;
    } else {
      dc->color2=j;
      if (dc->color.c1.rop&ROPBF_DITHER) {
	if (dc->color2.c0.color==dc->color.c0.color &&
	      dc->color.c0.color==dc->color.c1.color)
	  goto ff_done;
      } else if (dc->color2.c0.color==dc->color.c0.color)
	goto ff_done;
      dc->flags&=~DCF_FILL_NOT_COLOR;
    }
    if (not_color && j!=dc->color2 ||
	  !not_color)
      res=GrFloodFillRay(dc,x,y,z,db);
  }
ff_done:
  dc->brush=old_brush;
  dc->flags=old_flags;
  dc->color2=old_color2;
  return res;
}



U32 class CRGB {
  U8 r,g,b,a;
};

static U8 *doom_palette_dithered=NULL;

F64 ToLinear(F64 c) {
    F64 x = c/255.0;
    F64 y;
    if (x <= 0.04045) {
        y = x / 12.92;
    } else {
        y = Pow((x + 0.055) / 1.055, 2.4);
    }
    return y;
}

F64 ToSRGB(F64 x) {
    F64 v;
    if (x <= 0.0031308) {
        v = x * 12.92;
    } else {
        v = 1.055 * Pow(x, 1.0 / 2.4) - 0.055;
    }
    v = v * 255.0;
    if (v < 0.0) v = 0.0;
    if (v > 255.0) v = 255.0;
    return v;
}

//modified dither palette
U8 *DitherPalette(CRGB *data) {
  U8 *ret=MAlloc(16*16);
  CBGR48 palette48[16*16];
  I64 x,y,canidate,best_color;
  F64 best_dist,dist;
  CRGB normal[16*16],cur_pixel;
  GrPaletteGet(palette48);
  for(x=0;x!=16;x++) {
    normal[x].r=ToF64(palette48[x].r)/0xfff*0xff;
    normal[x].g=ToF64(palette48[x].g)/0xfff*0xff;
    normal[x].b=ToF64(palette48[x].b)/0xfff*0xff;
    normal[x*16].r=normal[x].r;
    normal[x*16].g=normal[x].g;
    normal[x*16].b=normal[x].b;
  }
  for(y=1;y!=16;y++) {
    for(x=1;x!=16;x++) {
     //perceptual interpolation
     //F64 r = (ToLinear(normal[x].r) + ToLinear(normal[y].r)) * 0.5;
     //F64 g = (ToLinear(normal[x].g) + ToLinear(normal[y].g)) * 0.5;
     //F64 b = (ToLinear(normal[x].b) + ToLinear(normal[y].b)) * 0.5;

     //normal[x+y*16].r = ToSRGB(r);
     //normal[x+y*16].g = ToSRGB(g);
     //normal[x+y*16].b = ToSRGB(b);
      normal[x+y*16].r=ToF64(normal[x].r+normal[y].r)/2;
      normal[x+y*16].g=ToF64(normal[x].g+normal[y].g)/2;
      normal[x+y*16].b=ToF64(normal[x].b+normal[y].b)/2;
    }
  }
  for(x=0;x!=16;x++) {
    for(y=0;y!=16;y++) {
      cur_pixel=data[x+y*16];
      best_color=0;
      best_dist=1e100;
      if(!cur_pixel.a||!(cur_pixel.g<20&&cur_pixel.r<20&&cur_pixel.b))  {
        for(canidate=0;canidate!=16*16;canidate++) {
         F64 r1 = ToLinear(normal[canidate].r);
         F64 g1 = ToLinear(normal[canidate].g);
         F64 b1 = ToLinear(normal[canidate].b);

         F64 r2 = ToLinear(cur_pixel.r);
         F64 g2 = ToLinear(cur_pixel.g);
         F64 b2 = ToLinear(cur_pixel.b);

         F64 dr = r1 - r2;
         F64 dg = g1 - g2;
         F64 db = b1 - b2;
         dist = dr*dr + dg*dg + db*db;	 
      // dist=Sqrt(Sqr(normal[canidate].r-cur_pixel.r)+
	 //       Sqr(normal[canidate].g-cur_pixel.g)+
	 //       Sqr(normal[canidate].b-cur_pixel.b));
	  if(dist<best_dist) {
	    best_dist=dist;
	    best_color=canidate;
	  }
        }
        ret[x+y*16]=best_color;
      } else
        ret[x+y*16]=TRANSPARENT;
    }
  }
  ret[TRANSPARENT]=TRANSPARENT;
  return ret;
}

CDC *PaletteizeImage(I64 w,I64 h,U8 *dith_data) {
  CDC *ret=DCNew(w*2,h*2);
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
}

class CDoomImage {
  I16 w,h,left,top;
  I32 col_offs[0];
};

class CDoomImageCol {
  U8 rowstart,px_cnt,silly_bye;
  U8 data[0];
};

//https://doomwiki.org/wiki/Picture_format
CDC *ReadDoomImage(CDoomImage *header) {
  I64 w=header->w,h=header->h,rowstart,i,j,px_cnt;
  U8 *ptr;
  U8 *pdata=CAlloc(w*h);
  for(i=0;i!=w;i++)
    for(j=0;j!=h;j++)
      pdata[j*w+i]=TRANSPARENT;
  for(i=0;i!=w;i++) {
    ptr=header(U8*)+header->col_offs[i];
    rowstart=0;
    while(rowstart!=255) {
      rowstart=*ptr++;
      if(rowstart==255) break;
      px_cnt=*ptr++;
      //Print("%d\n",px_cnt);
      //if(!px_cnt) throw('Poop');
      ptr++;
      for(j=0;j!=px_cnt;j++) {
        pdata[(j+rowstart)*w+i]=doom_palette_dithered[*ptr++];
      }
      ptr++;
    }
  }
  ptr=PaletteizeImage(w,h,pdata);
  Free(pdata);
  ptr(CDC*)->x=header->left;
  ptr(CDC*)->y=header->top;
  return ptr;
}

CDC *ReadDoomFlat(U8 *flat,CRGB *pal) {
  I64 len;
  CDC *ret;
  U8 *dith=CAlloc(64*64);
  for(len=64*64-1;len>=0;len--)
    dith[len]=doom_palette_dithered[flat[len]];
  ret=PaletteizeImage(64,64,dith);
  Free(dith);
  return ret;
}
CRGB *LoadPLAYPALFromLump(U8 *lump) {
  CRGB *ret=CAlloc(sizeof(CRGB)*256);
  I64 cnt;
  for(cnt=0;cnt!=256;cnt++) {
    ret[cnt].r=*lump++;
    ret[cnt].g=*lump++;
    ret[cnt].b=*lump++;
  }
  Free(doom_palette_dithered);
  doom_palette_dithered=DitherPalette(ret);
  return ret;
}


class CWad {
  U8 body[0];
  U8 ident[4];
  U32 lump_cnt;
  U32 directory_ptr;
};
 



CWad *LoadWad(U8 *filename) {
  return FileRead(filename);

}
static CWad *wad=LoadWad("Data/RPG.WAD");

class CWadDirectory {
  U32 ptr;
  U32 lump_size;
  U8 lump_name[8];
};


class CDoomGr {
  CRGB *palette;
  I64 pname_cnt;
  U64 *pnames;
};

class CWadTexturePatch {
  I16 origin_x,origin_y;
  I16 patch_index;
  I16 unused,unused2;
};

class CWadTexture {
  U8 name[8];
  I32 unused;
  I16 w,h;
  I32 unused2;
  I16 patch_cnt; 
  CWadTexturePatch patches[0];
};

class CWadTEXTURE1 {
  I32 num_textures;
  I32 texture_offsets[0];
};

class CWadPnames {
  I32 len;
  U64 names[0];
};

I64 StrCmp8(U8 *a,U8 *b) {
  if(StrLen(a)>8||StrLen(b)>8)
    return StrNCmp(a,b,8);
  return StrCmp(a,b);
}

CDC *PNameIndexToDC(I64 idx,CDoomGr *gr) {
  U8 name[9];
  name[8]=0;
  MemCpy(name,&gr->pnames[idx],8);
  return FramePtr(name);
}


I64 PNameIndex(U8 *name,CDoomGr *gr) {
  I64 idx=gr->pname_cnt;
  while(--idx>=0) {
    if(!StrCmp8(&gr->pnames[idx],name))
      return idx;
  }
  return -1;
}

// Patches.
// A patch holds one or more columns.
// Patches are used for sprites and all masked pictures,
// and we compose textures from the TEXTURE1/2 lists
// of patches.
class patch_t 
{ 
    I32 width;		// bounding box size 
    I32 height; 
    I32 leftoffset;	// pixels to the left of origin 
    I32 topoffset;	// pixels below the origin 
    I64 columnofs[8];	// only [width] used
    // the [0] is &columnofs[width] 
};


//
// W_CheckNumForName
// Returns -1 if name not found.
//

I64 W_CheckNumForName (U8 *name,CWad *doom_wad)
{

    U8 name8[9];    
    
    I32		v1;
    I32		v2;
    CWadDirectory*	lump_p;

    // make the name into two integers for easy compares
    MemCpy (name8,name,8);

    // in case the name was a fill 8 chars
    name8[8] = 0;

    // case insensitive
    for(v1=0;v1!=8;v1++)
      name8[v1]=ToUpper(name8[v1]);
    //Print("%s\n",name);
    // scan backwards so patch lump files take precedence
    CWadDirectory *lumpinfo = doom_wad(U8*)+doom_wad->directory_ptr;
    lump_p=lumpinfo+doom_wad->lump_cnt;

    while (lump_p-- != lumpinfo)
    {
	if (!StrCmp8(lump_p->lump_name,name8))
	{
	      return lump_p - lumpinfo;
	}
    }

   return -1;
}

//
//Nroot,get lump by num
//
U8 *W_GetLumpPtrFromNum(I64 idx,CWad *wad,I64 *lump_len=NULL) {
  CWadDirectory *dir=wad(U8*)+wad->directory_ptr;
  dir+=idx;
  if(lump_len) *lump_len=dir->lump_size;
  return wad(U8*)+dir->ptr;
} 
//
// Nroot,Get pointer to lump
//
U8 *W_GetLumpPtrFromName(U8 *name,CWad *wad,I64 *lump_len=NULL,I64 which=1) {
  I64 idx=W_CheckNumForName(name,wad);
  return W_GetLumpPtrFromNum(idx,wad,lump_len);
}




U0 LoadWadTEXTUREs(CWadTEXTURE1 *header,CDoomGr *gr) {
  I64 texture,i,anim_cnt,x,y;
  U8 name[9];
  CDC *result,*patch;
  CWadTexture *map_texture;
  for(texture=0;texture!=header->num_textures;texture++) {
    map_texture=header(U8*)+header->texture_offsets[texture];
    result=DCNew(map_texture->w*2,map_texture->h*2);
    DCFill(result,TRANSPARENT);
    name[8]=0;
    MemCpy(name,map_texture->name,8);
    for(i=0;i!=map_texture->patch_cnt;i++) {
      if(patch=PNameIndexToDC(map_texture->patches[i].patch_index,gr))
      GrBlot(result,
	map_texture->patches[i].origin_x*2,
	map_texture->patches[i].origin_y*2,
	patch);
    }
    for(x=0;x!=result->width;x++)
      for(y=0;y!=result->height;y++) {
	if(GrPeek0(result,x,y)==TRANSPARENT)
	  goto fin;
      }
//MAKE SURE TO SET THIS FOR THE RENDERER
    result->flags|=DCF_NO_TRANSPARENTS;
fin:
    FramePtrAdd(name,result);
    //GrBlot(,0,0,result);
    //Sleep(100);
  }
}

CDoomGr *LoadWadGr(CWad *wad) {
  CDoomGr *ret=CAlloc(sizeof(CDoomGr));
  CWadDirectory *wad_dir;
  I64 idx,pass;
  U8 lump_name[9];
  CWadPnames *pnames;
  CDC *gr;
//Load Player palett
  if(W_CheckNumForName("PLAYPAL",wad)!=-1)
    ret->palette=LoadPLAYPALFromLump(W_GetLumpPtrFromName("PLAYPAL",wad));
//Find the sprites start
//Load Wall Patch names(ONLYUSE LASTFOR NOW)
  //pass=1;
  //do {
    wad_dir=wad->body+wad->directory_ptr;
    wad_dir+=W_CheckNumForName("PNAMES",wad);
    pnames=wad->body+wad_dir->ptr;
    ret->pname_cnt=pnames->len;
    ret->pnames=MAlloc(ret->pname_cnt*8);
    MemCpy(ret->pnames,pnames->names,ret->pname_cnt*8);
//Load wall patches
    wad_dir=wad->body+wad->directory_ptr;
    wad_dir+=W_CheckNumForName("P_START",wad);
    //Print("%d\n",wad->body+wad->directory_ptr);
found_pstart:
    wad_dir++; //Move past S_START
    //Print("\n%s\n",wad_dir->lump_name);
    if(StrCmp8(wad_dir->lump_name,"P_END")) {
      if(wad_dir->lump_size) {
        lump_name[8]=0;
        MemCpy(lump_name,wad_dir->lump_name,8);
        //Print("\n%s\n",lump_name);
        gr=ReadDoomImage(wad->body+wad_dir->ptr);
       //GrBlot(,0,0,gr);
       //Sleep(100);
       //DCFill;
       FramePtrAdd(lump_name,gr);
      }
      goto found_pstart;
    }
    LoadWadTEXTUREs(W_GetLumpPtrFromName("TEXTURE1",wad),ret);
    if(W_CheckNumForName("TEXTURE2",wad)!=-1)
      LoadWadTEXTUREs(W_GetLumpPtrFromName("TEXTURE2",wad),ret);
    pass++;
  //} while(TRUE);

  //FACES

  //LoadGrLump(wad,"STFST01");
  //LoadGrLump(wad,"STFST00");
  //LoadGrLump(wad,"STFST02");

  return ret;
}


//LoadWad("RPG.WAD");
LoadWadGr(wad);


