I64 tm_switch_cnt=0,tm_switch_done=0,tm_switch_sounds=0,tm_switch_sound=0,
	tm_switch_sector=0,tm_switch_mode=0;
Switches *tm_switch_test;

U0 TmSwitchSound(I64 sector,I64 sound)
{
  tm_switch_sector=sector; tm_switch_sound=sound; tm_switch_sounds++;
  if (tm_switch_mode==1) {
    tm_switch_mode=0;
    SwitchChange(tm_switch_test,1,TRUE);
  } else if (tm_switch_mode==2) throw('SoundErr',TRUE);
}

U0 TmSwitchTest()
{
  I64 initial=Fs->data_heap->used_u8s,
	i,j,k,pair,where,repeat,which,special,used,sound;
  Map *map=RoomsNew(FALSE);
  World world;
  Motion motion;
  Graphics graphics;
  Texture textures[6];
  TexDef defs[6];
  Sectors *sectors;
  Switches *switches;
  Button *button;
  U8 *names="SW1BRCOMSW2BRCOMSW1COMM\0SW2COMM\0SW1SKULLSW2SKULL",*field;
  Bool caught;
  MemSet(&world,0,sizeof(World)); MemSet(&motion,0,sizeof(Motion));
  MemSet(&graphics,0,sizeof(Graphics)); MemSet(textures,0,sizeof(textures));
  MemSet(defs,0,sizeof(defs));
  Free(map->line); Free(map->side);
  map->line_cnt=map->side_cnt=40;
  map->line=CAlloc(40*sizeof(Line)); map->side=CAlloc(40*sizeof(Side));
  for (i=0;i<40;i++) {
    map->line[i].v2=1; map->line[i].side[0]=i; map->line[i].side[1]=0xFFFF;
    map->side[i].sector=i&1;
  }
  graphics.texture=textures; graphics.tex_cnt=6;
  for (i=0;i<6;i++) {textures[i].def=defs+i; MemCpy(defs[i].name,names+i*8,8);}
  world.map=map; motion.world=&world; sectors=SectorsNew(&motion,&graphics);
  sectors->sound=&TmSwitchSound; switches=SwitchesNew(sectors);
  tm_switch_test=switches;
  if (switches->cnt!=6 || graphics.cache_size) throw('Pairs');
  for (i=0;i<6;i++) if (switches->pair[i]!=i) throw('Order');
  tm_switch_cnt++;
  used=Fs->data_heap->used_u8s;
  for (pair=0;pair<3;pair++)
    for (where=0;where<3;where++)
      for (repeat=0;repeat<2;repeat++)
	for (which=0;which<2;which++)
	  for (special=0;special<3;special++) {
	    MemSet(map->side[0].upper,0,24);
	    field=SwitchSide(switches,0,where); i=pair*2+which;
	    MemCpy(field,defs[i].name,8);
	    j=42;
	    if (special==1) j=11;
	    if (special==2) j=51;
	    map->line[0].special=j; tm_switch_sounds=0;
	    sound=TM_SFX_SWTCHN;
	    if (special) sound=TM_SFX_SWTCHX;
	    if (!SwitchChange(switches,0,repeat) ||
		  MemCmp(field,defs[i^1].name,8) || tm_switch_sounds!=1 ||
		  tm_switch_sector || tm_switch_sound!=sound) throw('Change');
	    if (!repeat) j=0;
	    if (map->line[0].special!=j || !switches->first==repeat)
	      throw('Once');
	    for (k=1;k<=35;k++) {
	      ButtonsTick(switches);
	      j=i^1;
	      if (repeat && k==35) j=i;
	      if (MemCmp(field,defs[j].name,8)) throw('Reset');
	    }
	    if (switches->first || Fs->data_heap->used_u8s!=used ||
		  tm_switch_sounds!=1+repeat) throw('Owned');
	    tm_switch_cnt++;
	  }
  MemSet(map->side[0].upper,0,24);
  MemCpy(map->side[0].upper,defs[2].name,8);
  MemCpy(map->side[0].lower,defs[0].name,8);
  if (!SwitchChange(switches,0,TRUE) ||
	MemCmp(map->side[0].lower,defs[1].name,8) ||
	MemCmp(map->side[0].upper,defs[2].name,8) || switches->first->where!=2)
    throw('Priority');
  tm_switch_cnt++;
  for (i=0;i<10;i++) ButtonsTick(switches);
  MemSet(map->side[0].upper,0,8);
  if (!SwitchChange(switches,0,TRUE) || switches->first!=switches->last ||
	switches->first->tics!=25 || MemCmp(map->side[0].lower,defs[0].name,8))
    throw('Again');
  for (i=0;i<25;i++) ButtonsTick(switches);
  if (switches->first || MemCmp(map->side[0].lower,defs[0].name,8))
    throw('Timer');
  tm_switch_cnt++;
  MemSet(map->side[0].upper,0,24); map->line[0].special=42;
  if (SwitchChange(switches,0,FALSE) || map->line[0].special) throw('NoTex');
  tm_switch_cnt++;
  for (i=0;i<40;i++) {
    MemSet(map->side[i].upper,0,24); MemCpy(map->side[i].middle,defs[0].name,8);
    if (!SwitchChange(switches,i,TRUE) || tm_switch_sector!=i&1)
      throw('Many');
  }
  j=0;
  for (button=switches->first;button;button=button->next) j++;
  if (j!=40) throw('Count');
  for (i=0;i<35;i++) ButtonsTick(switches);
  for (i=0;i<40;i++)
    if (MemCmp(map->side[i].middle,defs[0].name,8)) throw('ManyEnd');
  if (switches->first || Fs->data_heap->used_u8s!=used) throw('ManyFree');
  tm_switch_cnt+=40;
  SwitchChange(switches,0,TRUE);
  for (i=0;i<34;i++) ButtonsTick(switches);
  tm_switch_mode=1; ButtonsTick(switches);
  if (!switches->first || switches->first!=switches->last ||
	switches->first->line!=1 || switches->first->tics!=35) throw('Append');
  tm_switch_cnt++;
  for (i=0;i<34;i++) ButtonsTick(switches);
  tm_switch_mode=2; caught=FALSE;
  try {
    ButtonsTick(switches);
  } catch {
    if (Fs->except_ch=='SoundErr') {Fs->catch_except=TRUE; caught=TRUE;}
  }
  if (!caught || switches->first || Fs->data_heap->used_u8s!=used ||
	MemCmp(map->side[1].middle,defs[0].name,8)) throw('Except');
  tm_switch_cnt++; tm_switch_mode=0;
  SwitchChange(switches,0,TRUE); SwitchChange(switches,1,TRUE);
  SwitchesDel(switches); SectorsDel(sectors); MapDel(map);
  if (Fs->data_heap->used_u8s!=initial) throw('Leak');
  tm_switch_done=1; "SWITCH %d CASES BAD 0\n",tm_switch_cnt;
}
TmSwitchTest;
