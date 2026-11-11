I64 tm_place_cases=0,tm_place_done=0;

U0 TmPlaceTest()
{
  GameData *data=GameDataNew("C:/ORACLE/TMDATA.BIN");
  Map *map=RoomsNew(FALSE);
  World *world=WorldNew(map,data);
  Actor *actor=WorldSpawn(world,TM_MT_TROOP,0,0),
	*other=WorldSpawn(world,TM_MT_TROOP,0,0),*found;
  I64 i,j,x,y,z,sector,block,old_block,id,seen,used,flags,ox,oy,oz;
  Bool caught;
  if (!data) throw('Files');
  map->sector[0].floor=7*65536; map->sector[0].ceil=19*65536;
  map->sector[1].floor=-3*65536; map->sector[1].ceil=99*65536;
  used=Fs->data_heap->used_u8s;
  for (i=0;i<2;i++) {
    WorldActorUnlink(world,actor);
    if (i) actor->flags|=TM_MF_NOBLOCKMAP;
    WorldActorLink(world,actor);
    for (j=0;j<81;j++) {
      x=(j%9-4)*128*65536; y=(j/9-4)*128*65536; z=(j-40)*65536;
      sector=0; if (x<=0) sector=1;
      block=-1;
      if (!i && -256*65536<=x<256*65536 && -256*65536<=y<256*65536) {
	block=(x+256*65536)>>23; block+=(y+256*65536)>>23*4;
      }
      old_block=actor->block;
      if (!WorldActorPlace(world,actor,x,y,z) || actor->x!=x || actor->y!=y ||
	    actor->z!=z || actor->sector!=sector || actor->block!=block ||
	    actor->floor!=map->sector[sector].floor ||
	    actor->ceil!=map->sector[sector].ceil) {
	"PLACE %d %d SECTOR %d EXPECT %d BLOCK %d EXPECT %d\n",
	      i,j,actor->sector,sector,actor->block,block;
	throw('Place');
      }
      seen=0;
      if (block>=0) {
	id=world->blocks[block];
	while (found=WorldActorGet(world,id,FALSE)) {
	  if (found==actor) seen++;
	  id=found->block_next;
	}
	if (seen!=1) throw('Link');
      }
      if (old_block>=0 && old_block!=block) {
	id=world->blocks[old_block];
	while (found=WorldActorGet(world,id,FALSE)) {
	  if (found==actor) throw('Unlink');
	  id=found->block_next;
	}
      }
      if (Fs->data_heap->used_u8s!=used) throw('Alloc');
      tm_place_cases++;
    }
  }
  WorldActorUnlink(world,actor); actor->flags&=~TM_MF_NOBLOCKMAP;
  WorldActorLink(world,actor);
  if (!WorldActorPlace(world,actor,other->x,other->y,100*65536) ||
	actor->block!=other->block || actor->block_next!=other->id ||
	other->block_last!=actor->id) throw('Bypass');
  tm_place_cases++;
  for (i=0;i<2;i++) {
    ox=actor->x; oy=actor->y; oz=actor->z;
    flags=actor->flags; old_block=actor->block; caught=FALSE;
    if (!i) actor->active=FALSE;
    else actor->world=NULL;
    try {
      if (WorldActorPlace(world,actor,-128*65536,-128*65536,0))
	throw('Guard');
    } catch {
      if (i==1 && Fs->except_ch=='World') {
	caught=TRUE; Fs->catch_except=TRUE;
      }
    }
    if (caught!=!!i || actor->x!=ox || actor->y!=oy || actor->z!=oz ||
	  actor->flags!=flags || actor->block!=old_block ||
	  other->block_last!=actor->id) throw('Atomic');
    actor->world=world; actor->active=TRUE; tm_place_cases++;
  }
  WorldDel(world); MapDel(map); GameDataDel(data); tm_place_done=1;
  "PLACE 165 CASES BAD 0\n";
}

TmPlaceTest;
