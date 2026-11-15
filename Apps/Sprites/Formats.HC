public U8 *SpriteGif(U8 *frames,I64 size,I64 width,I64 height,
      I64 cnt,F64 delay,I64 *_size)
{//GIF89a literal LZW runs, with fractional delays shared across frames.
  I64 pixels=width*height,codes,packed_size,result_size,f,i,j,n,
      ticks,at=0,pos,bits,pending,code;
  U8 *res=NULL,*packed=NULL,*frame;
  sprite_gr_error=NULL;
  if (!SpriteGrStride(width,height)) return NULL;
  if (!(1<=cnt<=600) || cnt*pixels>20000000) {
    sprite_gr_error="Animation exceeds the frame or pixel limit.";
    return NULL;
  }
  if (!(20<=delay<=655350)) {
    sprite_gr_error="Invalid frame delay.";return NULL;
  }
  if (size!=pixels*cnt) {
    sprite_gr_error="Invalid indexed frame length.";return NULL;
  }
  for (i=0;i<size;i++)
    if (frames[i]>15 && frames[i]!=TRANSPARENT) {
      sprite_gr_error="Invalid TempleOS palette index.";return NULL;
    }
  SpriteColorsInit;
  codes=pixels+(pixels+15)/16+1;packed_size=(codes*6+7)/8;
  result_size=129+cnt*(20+packed_size+(packed_size+254)/255);
  try {
    res=CAlloc(result_size);packed=MAlloc(packed_size);
    MemCpy(res,"GIF89a",6);
    *(res+6)(U16 *)=width;*(res+8)(U16 *)=height;
    res[10]=0xF4;res[11]=16;
    MemCpy(res+13,sprite_palette,48);
    MemCpy(res+109,"\x21\xFF\x0BNETSCAPE2.0\x03\x01\0\0\0",19);
    at=128;
    for (f=0;f<cnt;f++) {
      ticks=Floor((f+1)*delay/10+0.5)-Floor(f*delay/10+0.5);
      MemCpy(res+at,"\x21\xF9\x04\x09",4);
      *(res+at+4)(U16 *)=MaxI64(2,ticks);res[at+6]=16;
      at+=8;res[at]=44;
      *(res+at+5)(U16 *)=width;*(res+at+7)(U16 *)=height;
      res[at+10]=5;at+=11;
      frame=frames+f*pixels;pos=bits=pending=0;
      for (i=0;i<codes;i++) {
	if (i==codes-1) code=33;
	else if (!(i%17)) code=32;
	else {
	  code=frame[i-i/17-1];
	  if (code==TRANSPARENT) code=16;
	}
	pending|=code<<bits;bits+=6;
	while (bits>=8) {
	  packed[pos++]=pending&255;pending>>=8;bits-=8;
	}
      }
      if (bits) packed[pos]=pending;
      for (j=0;j<packed_size;j+=255) {
	n=MinI64(255,packed_size-j);res[at++]=n;
	MemCpy(res+at,packed+j,n);at+=n;
      }
      at++;
    }
    res[at++]=59;*_size=at;
  } catch {
    Free(res);Free(packed);
  }
  Free(packed);
  return res;
}

class CSpriteFile
{
  I64 name,body,name_size,size;
};

U32 SpriteCrc32(U8 *src,I64 size)
{
  I64 crc=0xFFFFFFFF,i,j;
  for (i=0;i<size;i++) {
    crc^=src[i];
    for (j=0;j<8;j++)
      if (crc&1) crc=crc>>1^0xEDB88320;
      else crc>>=1;
  }
  return crc^0xFFFFFFFF;
}

public U8 *SpriteZip(U8 *src,I64 size,I64 cnt,I64 *_size)
{//Stored ZIP entries. Names are UTF-8; timestamps remain deterministic.
  CSpriteFile *files=src,*file;
  I64 i,local_size=0,central_size=0,offset=0,at,result_size,crc;
  U8 *res,*h,*c;
  sprite_gr_error=NULL;
  if (!(0<=cnt<=65535) || size<cnt*sizeof(CSpriteFile)) {
    sprite_gr_error="Invalid ZIP file list.";return NULL;
  }
  for (i=0;i<cnt;i++) {
    file=&files[i];
    if (!(0<=file->name_size<=65535) || file->size<0 ||
	file->name<0 || file->body<0 ||
	file->name>size-file->name_size ||
	file->body>size-file->size) {
      sprite_gr_error="Invalid ZIP entry.";return NULL;
    }
    local_size+=30+file->name_size+file->size;
    central_size+=46+file->name_size;
  }
  result_size=local_size+central_size+22;
  if (result_size>0xFFFFFFFF) {
    sprite_gr_error="ZIP exceeds the format size limit.";return NULL;
  }
  res=CAlloc(result_size);at=local_size;
  for (i=0;i<cnt;i++) {
    file=&files[i];crc=SpriteCrc32(src+file->body,file->size);
    h=res+offset;c=res+at;
    *h(U32 *)=0x04034B50;*(h+4)(U16 *)=20;
    *(h+6)(U16 *)=0x800;*(h+12)(U16 *)=33;
    *(h+14)(U32 *)=crc;*(h+18)(U32 *)=file->size;
    *(h+22)(U32 *)=file->size;*(h+26)(U16 *)=file->name_size;
    MemCpy(h+30,src+file->name,file->name_size);
    MemCpy(h+30+file->name_size,src+file->body,file->size);
    *c(U32 *)=0x02014B50;*(c+4)(U16 *)=20;*(c+6)(U16 *)=20;
    *(c+8)(U16 *)=0x800;*(c+14)(U16 *)=33;*(c+16)(U32 *)=crc;
    *(c+20)(U32 *)=file->size;*(c+24)(U32 *)=file->size;
    *(c+28)(U16 *)=file->name_size;*(c+42)(U32 *)=offset;
    MemCpy(c+46,src+file->name,file->name_size);
    offset+=30+file->name_size+file->size;at+=46+file->name_size;
  }
  h=res+at;*h(U32 *)=0x06054B50;
  *(h+8)(U16 *)=cnt;*(h+10)(U16 *)=cnt;
  *(h+12)(U32 *)=central_size;*(h+16)(U32 *)=local_size;
  *_size=result_size;
  return res;
}
