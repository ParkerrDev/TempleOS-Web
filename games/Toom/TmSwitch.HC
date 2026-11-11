#define TM_BUTTON_TICS	35

U8 *tm_switch_names="BRCOM\0BRN1\0BRN2\0BRNGN\0BROWN\0COMM\0COMP\0DIRT\0"
	"EXIT\0GRAY\0GRAY1\0METAL\0PIPE\0SLAD\0STARG\0STON1\0STON2\0STONE\0"
	"STRTN\0BLUE\0CMT\0GARG\0GSTON\0HOT\0LION\0SATYR\0SKIN\0VINE\0WOOD\0"
	"PANEL\0ROCK\0MET2\0WDMET\0BRIK\0MOD1\0ZIM\0STON6\0TEK\0MARB\0SKULL\0";

class Button
{
  Button *next,*last;
  I64 line,where,tics;
  U8 texture[8];
};

class Switches
{
  Sectors *sectors;
  I64 pair[80],cnt;
  Button *first,*last;
};

U8 *SwitchSide(Switches *tmps,I64 line,I64 where)
{
  Map *map=tmps->sectors->motion->world->map;
  Side *side=map->side+map->line[line].side[0];
  if (!where) return side->upper;
  if (where==1) return side->middle;
  return side->lower;
}

U0 SwitchesDel(Switches *tmps)
{
  Button *tmpb,*next;
  if (tmps) {
    for (tmpb=tmps->first;tmpb;tmpb=next) {next=tmpb->next; Free(tmpb);}
    Free(tmps);
  }
}

Switches *SwitchesNew(Sectors *sectors)
{//Only available texture pairs participate; no image decoding is needed.
  Switches *tmps=CAlloc(sizeof(Switches));
  Graphics *graphics=sectors->graphics;
  U8 *name=tm_switch_names,first[9],second[9];
  I64 a,b;
  tmps->sectors=sectors;
  if (graphics)
    while (*name) {
      MemSet(first,0,9); MemSet(second,0,9);
      StrPrint(first,"SW1%s",name); StrPrint(second,"SW2%s",name);
      a=TextureFind(graphics,first); b=TextureFind(graphics,second);
      if (a>=0 && b>=0) {
	tmps->pair[tmps->cnt++]=a; tmps->pair[tmps->cnt++]=b;
      }
      name+=StrLen(name)+1;
    }
  return tmps;
}

U0 ButtonStart(Switches *tmps,I64 line,I64 where,U8 *texture)
{//Repeated presses retain the first reset texture and its original timer.
  Button *tmpb;
  for (tmpb=tmps->first;tmpb;tmpb=tmpb->next)
    if (tmpb->line==line) return;
  tmpb=CAlloc(sizeof(Button));
  tmpb->line=line; tmpb->where=where; tmpb->tics=TM_BUTTON_TICS;
  MemCpy(tmpb->texture,texture,8);
  tmpb->last=tmps->last;
  if (tmps->last) tmps->last->next=tmpb;
  else tmps->first=tmpb;
  tmps->last=tmpb;
}

Bool SwitchChange(Switches *tmps,I64 line,Bool repeat)
{//Pair order precedes upper, middle and lower field order, as in the source.
  Map *map=tmps->sectors->motion->world->map;
  Graphics *graphics=tmps->sectors->graphics;
  Texture *texture;
  I64 i,where,sound=TM_SFX_SWTCHN,sector;
  U8 *field;
  if (!(0<=line<map->line_cnt)) return FALSE;
  if (map->line[line].special==11 || map->line[line].special==51)
    sound=TM_SFX_SWTCHX;
  if (!repeat) map->line[line].special=0;
  sector=map->side[map->line[line].side[0]].sector;
  for (i=0;i<tmps->cnt;i++) {
    texture=graphics->texture+tmps->pair[i];
    for (where=0;where<3;where++) {
      field=SwitchSide(tmps,line,where);
      if (!MemCmp(field,texture->def->name,8)) {
	if (repeat) ButtonStart(tmps,line,where,field);
	MemCpy(field,graphics->texture[tmps->pair[i^1]].def->name,8);
	SectorSnd(tmps->sectors,sector,sound);
	return TRUE;
      }
    }
  }
  return FALSE;
}

U0 ButtonsTick(Switches *tmps)
{//Remove expired entries before callbacks can append another button.
  Map *map=tmps->sectors->motion->world->map;
  Button *tmpb=tmps->first,*last=tmps->last,*next;
  I64 sector;
  Bool end;
  while (tmpb) {
    next=tmpb->next; end=tmpb==last;
    if (!--tmpb->tics) {
      MemCpy(SwitchSide(tmps,tmpb->line,tmpb->where),tmpb->texture,8);
      sector=map->side[map->line[tmpb->line].side[0]].sector;
      if (tmpb->last) tmpb->last->next=tmpb->next;
      else tmps->first=tmpb->next;
      if (tmpb->next) tmpb->next->last=tmpb->last;
      else tmps->last=tmpb->last;
      Free(tmpb);
      SectorSnd(tmps->sectors,sector,TM_SFX_SWTCHN);
    }
    if (end) break;
    tmpb=next;
  }
}
