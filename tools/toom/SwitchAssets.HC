I64 tm_switch_assets=0;
U0 TmSwitchAssets()
{
  Wad *wad=WadNew("C:/ORACLE/FREEDOOM.WAD");
  Graphics *graphics;
  Map *map=RoomsNew(FALSE);
  World world;
  Motion motion;
  Sectors *sectors;
  Switches *switches;
  I64 i,j,k,reads,used;
  U8 *field;
  if (!wad) throw('Wad');
  graphics=GraphicsNew(wad);
  if (!graphics) throw('Graphics');
  MemSet(&world,0,sizeof(World)); MemSet(&motion,0,sizeof(Motion));
  world.map=map; motion.world=&world;
  sectors=SectorsNew(&motion,graphics); reads=wad->read_bytes;
  switches=SwitchesNew(sectors); used=Fs->data_heap->used_u8s;
  if (switches->cnt!=80 || graphics->cache_size || wad->read_bytes!=reads)
    throw('Pairs');
  for (i=0;i<80;i++)
    for (j=0;j<3;j++) {
      MemSet(map->side[0].upper,0,24);
      field=SwitchSide(switches,0,j);
      MemCpy(field,graphics->texture[switches->pair[i]].def->name,8);
      if (!SwitchChange(switches,0,TRUE) ||
	    MemCmp(field,graphics->texture[switches->pair[i^1]].def->name,8))
	throw('Texture');
      for (k=0;k<35;k++) ButtonsTick(switches);
      if (MemCmp(field,graphics->texture[switches->pair[i]].def->name,8) ||
	    switches->first || Fs->data_heap->used_u8s!=used)
	throw('Restore');
      tm_switch_assets++;
    }
  if (graphics->cache_size || wad->read_bytes!=reads) throw('Eager');
  SwitchesDel(switches); SectorsDel(sectors); MapDel(map);
  GraphicsDel(graphics); WadDel(wad);
  "SWITCH ASSETS %d CASES BAD 0\n",tm_switch_assets;
}
TmSwitchAssets;
