I64 tm_light_tics=0,tm_light_cases=0,tm_light_done=0;

U0 TmLightTags(GameData *data)
{
  Map *map=RoomsNew(FALSE);
  World *world;
  Motion *motion;
  Sectors *sectors;
  Lights *lights;
  Light *light;
  Mover *mover;
  I64 i,n,random,used;
  Free(map->sector); Free(map->side);
  map->sector_cnt=4; map->side_cnt=6; map->line_cnt=3;
  map->sector=CAlloc(4*sizeof(Sector)); map->side=CAlloc(6*sizeof(Side));
  for (i=0;i<3;i++) {
    map->line[i].v1=0; map->line[i].v2=1; map->line[i].flags=4;
    map->line[i].side[0]=i*2; map->line[i].side[1]=i*2+1;
    map->side[i*2].sector=i; map->side[i*2+1].sector=i+1;
  }
  for (i=0;i<4;i++) map->sector[i].ceil=128*65536;
  map->line[0].tag=map->sector[0].tag=map->sector[2].tag=9;
  world=WorldNew(map,data); motion=MotionNew(world); sectors=SectorsNew(motion);
  used=Fs->data_heap->used_u8s; lights=LightsNew(sectors);
  map->sector[0].light=80; map->sector[1].light=32;
  map->sector[2].light=160; map->sector[3].light=220;
  if (SectorLightMin(sectors,0)!=32 || SectorLightMax(sectors,2)!=220)
    throw('Neighbor');
  LightTagOn(sectors,0,0);
  if (map->sector[0].light!=32 || map->sector[2].light!=32 ||
	map->sector[1].light!=32 || map->sector[3].light!=220)
    throw('FirstMax');
  LightTagOn(sectors,0,255);
  if (map->sector[0].light!=255 || map->sector[2].light!=255) throw('On');
  LightTagOff(sectors,0);
  if (map->sector[0].light!=32 || map->sector[2].light!=32) throw('Off');
  map->sector[0].light=-8;
  if (SectorLightMin(sectors,0)!=-8) throw('Signed');
  tm_light_cases+=5;
  mover=MoverNew(sectors,0,TM_MOVER_FLOOR); random=world->random;
  if (!LightStrobeTag(lights,0) || lights->first!=lights->last ||
	lights->first->sector!=2 || world->random!=(random+1)&255)
    throw('Busy');
  if (!LightStrobeTag(lights,0) || lights->last->sector!=2 ||
	lights->first==lights->last) throw('Repeat');
  MoverFinish(sectors,mover); MoversSweep(sectors);
  if (!LightStrobeTag(lights,0) || lights->last->sector!=2 ||
	world->random!=(random+4)&255) throw('Unbusy');
  n=0;
  for (light=lights->first;light;light=light->next) {
    i=2;
    if (n==2) i=0;
    if (light->sector!=i) throw('Order');
    n++;
  }
  if (n!=4) throw('Count');
  tm_light_cases+=4;
  LightsDel(lights);
  if (Fs->data_heap->used_u8s!=used) throw('Free');
  SectorsDel(sectors); MotionDel(motion); WorldDel(world); MapDel(map);
}

U0 TmLightTest()
{
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Map *map=RoomsNew(FALSE);
  World *world=WorldNew(map,data);
  Motion *motion=MotionNew(world);
  Sectors *sectors=SectorsNew(motion);
  Lights *lights;
  Light *light;
  I64 *body,*row,size,i,j,n,used;
  body=FileRead("C:/ORACLE/LIGHTS.BIN",&size); row=body+1;
  if (!data || !body) throw('Files');
  for (i=0;i<body[0];i++) {
    map->sector[0].special=row[0]; map->sector[0].light=row[1];
    map->sector[1].light=row[2]; world->random=row[3]; n=row[4]; row+=5;
    used=Fs->data_heap->used_u8s; lights=LightsNew(sectors); LightsInit(lights);
    light=lights->first;
    if (!light || light!=lights->last || light->sector || !lights->initialized)
      throw('Init');
    for (j=0;j<n;j++,row+=8) {
      if (j) {
	if (j==31) map->sector[0].light=255;
	if (j==79) map->sector[0].light=0;
	LightsTick(lights); tm_light_tics++;
      }
      if (map->sector[0].light!=row[0] || light->low!=row[1] ||
	    light->high!=row[2] || light->tics!=row[3] ||
	    light->direction!=row[4] || light->dark!=row[5] ||
	    world->random!=row[6] || map->sector[0].special!=row[7]) {
	"LIGHT CASE %d TIC %d GOT %d %d %d EXPECT %d %d %d\n",i,j,
	      map->sector[0].light,light->tics,world->random,
	      row[0],row[3],row[6];
	throw('Timeline');
      }
    }
    LightsDel(lights); tm_light_cases++;
    if (Fs->data_heap->used_u8s!=used) throw('Leak');
  }
  if (row(U8 *)-body(U8 *)!=size) throw('Rows');
  TmLightTags(data);
  Free(body); SectorsDel(sectors); MotionDel(motion);
  WorldDel(world); MapDel(map);
  GameDataDel(data); tm_light_done=1;
  "LIGHT %d CASES %d TICS BAD 0\n",tm_light_cases,tm_light_tics;
}
TmLightTest;
