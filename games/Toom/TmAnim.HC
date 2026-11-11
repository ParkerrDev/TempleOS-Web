#define TM_ANIMS_NUM	22
#define TM_FLAT_ANIMS_NUM 9
#define TM_ANIM_TICS	8

U8 *tm_anim_names="NUKAGE1\0NUKAGE3\0FWATER1\0FWATER4\0SWATER1\0SWATER4\0"
	"LAVA1\0LAVA4\0BLOOD1\0BLOOD3\0RROCK05\0RROCK08\0"
	"SLIME01\0SLIME04\0SLIME05\0SLIME08\0SLIME09\0SLIME12\0"
	"BLODGR1\0BLODGR4\0SLADRIP1\0SLADRIP3\0BLODRIP1\0BLODRIP4\0"
	"FIREWALA\0FIREWALL\0GSTFONT1\0GSTFONT3\0FIRELAV3\0FIRELAVA\0"
	"FIREMAG1\0FIREMAG3\0FIREBLU1\0FIREBLU2\0ROCKRED1\0ROCKRED3\0"
	"BFALL1\0BFALL4\0SFALL1\0SFALL4\0WFALL1\0WFALL4\0DBRAIN1\0DBRAIN4\0";

class PicAnim
{
  I64 first,cnt,kind;
};

class Surfaces
{
  Map *map;
  Graphics *graphics;
  I32 *textures,*flats,*scroll;
  I64 flat_first,flat_cnt,scroll_cnt,anim_cnt;
  PicAnim anim[TM_ANIMS_NUM];
};

U0 SurfacesDel(Surfaces *tmps)
{
  Free(tmps);
}

Surfaces *SurfacesNew(Map *map,Graphics *graphics)
{//One metadata allocation; no images are decoded or read here.
  Wad *wad=graphics->wad;
  Surfaces *tmps;
  PicAnim *anim;
  I64 i,j,a,b,first=LumpFind(wad,"F_START"),last=LumpFind(wad,"F_END"),cnt=0;
  U8 *name=tm_anim_names,start[9],end[9];
  if (first<0 || last<=first) return NULL;
  first++;
  for (i=0;i<map->line_cnt;i++) if (map->line[i].special==48) cnt++;
  tmps=CAlloc(sizeof(Surfaces)+(graphics->tex_cnt+last-first+cnt)*sizeof(I32));
  tmps->map=map; tmps->graphics=graphics;
  tmps->flat_first=first; tmps->flat_cnt=last-first;
  tmps->textures=tmps+1; tmps->flats=tmps->textures+graphics->tex_cnt;
  tmps->scroll=tmps->flats+tmps->flat_cnt;
  for (i=0;i<graphics->tex_cnt;i++) tmps->textures[i]=i;
  for (i=0;i<tmps->flat_cnt;i++) tmps->flats[i]=first+i;
  for (i=0;i<map->line_cnt;i++)
    if (map->line[i].special==48) tmps->scroll[tmps->scroll_cnt++]=i;
  for (i=0;i<TM_ANIMS_NUM;i++) {
    MemSet(start,0,9); MemSet(end,0,9);
    StrCpy(start,name); name+=StrLen(name)+1;
    StrCpy(end,name); name+=StrLen(name)+1;
    if (i<TM_FLAT_ANIMS_NUM) {
      a=LumpFind(wad,start); b=LumpFind(wad,end);
    } else {
      a=TextureFind(graphics,start); b=TextureFind(graphics,end);
    }
    if (a>=0) {
      if (b<=a) goto sn_fail;
      if (i<TM_FLAT_ANIMS_NUM) {
	if (a<first || b>=last) goto sn_fail;
	for (j=a;j<=b;j++) if (wad->dir[j].size!=4096) goto sn_fail;
      }
      anim=tmps->anim+tmps->anim_cnt++;
      anim->first=a; anim->cnt=b-a+1; anim->kind=i>=TM_FLAT_ANIMS_NUM;
    }
  }
  return tmps;
sn_fail:
  SurfacesDel(tmps);
  return NULL;
}

U0 SurfacesTick(Surfaces *tmps,I64 tic)
{//Flat phases use indices relative to F_START, as in the original.
  PicAnim *anim;
  Line *line;
  I64 i,j,n,phase;
  if (tic<0) throw('Tic');
  for (i=0;i<tmps->anim_cnt;i++) {
    anim=tmps->anim+i;
    for (j=anim->first;j<anim->first+anim->cnt;j++) {
      phase=j;
      if (!anim->kind) phase-=tmps->flat_first;
      n=anim->first+(tic/TM_ANIM_TICS+phase)%anim->cnt;
      if (anim->kind) tmps->textures[j]=n;
      else tmps->flats[phase]=n;
    }
  }
  for (i=0;i<tmps->scroll_cnt;i++) {
    line=tmps->map->line+tmps->scroll[i];
    if (line->special==48) tmps->map->side[line->side[0]].x++;
  }
}

I64 TextureFrame(Surfaces *tmps,I64 n)
{
  if (tmps && 0<=n<tmps->graphics->tex_cnt) return tmps->textures[n];
  return n;
}

I64 FlatFrame(Surfaces *tmps,I64 n)
{
  if (tmps && tmps->flat_first<=n<tmps->flat_first+tmps->flat_cnt)
    return tmps->flats[n-tmps->flat_first];
  return n;
}
