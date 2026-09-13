#ifndef FUN_WITH_FRIENDS
#define FUN_WITH_FRIENDS "poop"
#include "SlimProx";

#define TOOM_PORT 6666 //FreeBSD doesnt like low ports
class CServerSidedef {
  I64 idx;
  U8 upper_texture[32];
  U8 middle_texture[32];
  U8 lower_texture[32];
  Bool changed;
};

class CSidedefsHeader {
  U64 ident;
  U64 sz;
  F64 tS;
  CServerSidedef body[0];
};



class CServerSector {
  I32 idx;
  I16 floor_height,ceil_height;
  U8 floor_texture[32];
  U8 ceil_texture[32];
  Bool changed;
};

class CSectorsHeader {
  U64 ident;
  U64 sz;
  F64 tS;
  CServerSector body[0];
};

CTask *world_lock_task=NULL;
I64 world_lock=0;
I64 world_read_cnt=0;
U0 WorldLock(Bool read=FALSE) {
  while(LBts(&world_lock,0)) {
    Yield;
  }
  world_lock_task=Fs;
}
U0 WorldUnlock(Bool read=FALSE) {
  world_lock_task=NULL;
  LBtr(&world_lock,0);
}


#define CONNECTF_WANTS_THINGS 1
#define CONNECTF_BEGUN 2
#define CONNECTF_NO_REFRESH_THINGS 4
#define CONNECTF_READY 8
class CMPConnect:CQue {
  I64 sock,player_num;
  CDoomPlayer *player;
  CServerSidedef *sidedefs;
  CServerSector *sectors;
  CI64Set *keep_hashes;
  CI64Set *last_sent_hashes;
  CTask *read,*update;
  F64 last_recieve_things_tS;
  I64 flags;
};

CDoomPlayer *GetClientPlayer() {
  CMPConnect *mpc=FramePtr("Client.Connect");
  return mpc->player;
}

I64 MPHashThing(CDoomThing *t) {
  if(!t->template) return 0;
//>>2 to divide by 4,slightly moved objects will appear in the same spot. I dont think users will notice
  I64 hash=ToI64(t->height)>>2<<24+ToI64(t->y)>>2<<12+ToI64(t->x)>>2;
  U8 *tmp;
  if(!t->animation)
    t->animation=t->template->_animation;
  if(tmp=GetUNStr(t->animation))
    hash^=HashStr(tmp);
  return hash&U32_MAX;
}
//This message is for pushing the player when an enemy damages the player
#define MSG_DAMAGE_PUSH 'DmgPush'
#define MSG_HASH_THINGS 'HashTngs'
#define MSG_WANT_HASH_THINGS 'WantTHsh'
#define MSG_WANT_THINGS 'WantTngs'
#define MSG_SEND_THINGS 'SendTngs'
#define MSG_SEND_PLAYER 'CSndPlr' //Client send player
#define MSG_PLAYER_ATTACK 'PlrAtk'
#define MSG_PLAYER_MISSILE 'PlrMsl'
#define MSG_PLAYER_UPDATE 'PlrUpdt'
#define MSG_WANT_UPDATE 'WantUpdt'
#define MSG_KEEP_HASHES 'KeepHash'
//From the client only,picked up items from server are removed via MSG_SEND_THINGS
// For removing items see:
//   RecieveThings and CompareThingHashes
#define MSG_ITEM_PICKUP 'ItmPkup'
//Sent by Client,no body
#define MSG_SERVER_WHAT_LEVEL 'Wassup'
//Sent by Server,also uses `CWhatLevelHeader`
#define MSG_SERVER_REPLY_LEVEL 'thslvl'
//Sent by server x client
#define MSG_PLAY_SOUND 'PlySnd'

#define MSG_WANT_WORLD_THINKER_HASHES 'WrldHshW'
#define MSG_WORLD_SECTOR_HASHES 'SctrHshs'
#define MSG_WORLD_SEND_SECTORS 'SndSctrs'

//CSTMessageHeader
#define MSG_SAY_SOMETHING 'SaySmth'


//See CMPConnect.last_known_linedefs/sectors
#define MSG_WORLD_SIDEDEF_HASHES 'SdHshs'
#define MSG_WORLD_SEND_SIDEDEFS 'SndSds'

#define MSG_PRESS_A_WALL 'PrsWll'
#define MSG_TRIGGER_LINEDEF 'TrgrLd'

//CEndLevelHeader
#define MSG_END_LEVEL 'EndLvl'
//CSTMessageHeader 
#define MSG_ST_MESSAGE 'SttsMsg'
#define MSG_WHAT_TIME 'Time'
//CTeleportHeader
#define MSG_TELEPORT_PLAYER 'Teleport'

class CTeleportHeader {
  U64 ident;
  I64 sz;
  F64 tS;
  I64 x,y,angle;
};

class CSTMessageHeader {
  U64 ident;
  I64 sz;
  F64 tS;
  U8 msg[STR_LEN];
};

class CServerThing {
  F64 anim_start_tS;
  I16 old_x,old_y,old_h;
  I16 x,y,h;
  I16 angle;
  I16 health;
  U8 template[64];
  U8 anim_name[64];
  Bool anim_no_repeat;
};
class CServerPlayer:CServerThing {
  F64 rad_suit_time;
  F64 bezerk_time;
  F64 light_goggles_time;
  F64 invincible_time;
  F64 invisible_time;
  F64 armor;
  I64 additional_weapon_ammo[9];
  I64 has_weapon_ammo[9];
  I64 max_bullets;
  I64 max_shells;
  I64 max_rockets;
  I64 max_cells;
  U8 has_weapons[16];
  Bool has_red_key;
  Bool has_blue_key;
  Bool has_yellow_key;
  Bool made_a_sound;
};
class CGenericHeader {
  U64 ident;
  I64 sz;
  F64 tS;
};
class CEndLevelHeader {
  U64 ident;
  I64 sz;
  F64 tS;
  //TODO stats
};

class CWhatLevelHeader {
  U64 ident;
  I64 sz;
  F64 tS;
  U0 body;
  F64 spawn_x,spawn_y,server_tS;
  U8 map_name[16];
  I64 skill,which_spawn;
  Bool fresh_player;
}
class CWhatTimeHeader {
  U64 ident;
  I64 sz;
  F64 tS;
  F64 server_tS;
};
class CPickupHeader {
  U64 ident;
  I64 sz;
  F64 tS;
  U0 body;
  I64 x,y;
  I64 type;
};
class CSoundHeader {
  U64 ident;
  I64 sz;
  F64 tS;

  U0 body;
  I16 x,y;
  U8 name[9];
};
class CThingsHeader {
  U64 ident;
  I64 sz;
  F64 tS;
  CServerThing body[0];
};
class CHashesHeader {
  U64 ident;
  I64 sz;
  F64 tS;
  U32 body[0];
};
class CAskforHeader {
  U64 ident;
  I64 sz;
  F64 tS;
  U64 what;
};
class CLinedefSend {
  U64 ident;
  I64 sz;
  F64 tS;
  U0 body;
  I64 ld_idx;
  I64 flags;
  I16 x,y;
};
class CMissileSend {
  U64 ident;
  I64 sz;
  F64 tS;
  U0 body;
  U64 type;
  I64 target_hash;
  I64 sx,sy;
  I64 ex,ey;
};
class CPlayerAttack {
  U64 ident;
  I64 sz;
  F64 tS;
  U0 body;
  U32 target_hash;
  I16 damage;
  I64 fallback_angle;
  F64 range;
};

class CWallPress {
  U64 ident;
  I64 sz;
  F64 tS;
  U0 body;
  I16 angle;
  I16 x,y,height;
};

//MSG_DAMAGE_PUSH
class CPlayerPush {
  U64 ident;
  I64 sz;
  F64 tS;
  U0 body;
  F64 angle;
  F64 force;
  F64 damage;
};

extern U0 MPClientSync(CMPConnect *con,CDoomLevel *l);

U0 SendMessage(CMPConnect *con,CGenericHeader *msg) {
  msg->tS=Server_tS;
  CArcCompress *buf=CompressBuf(msg,msg->sz);
  SlimProxSend(con->sock,buf,buf->compressed_size,0);
  Free(buf);
}
CGenericHeader *GetMessage(CMPConnect *con) {
  CArcCompress head,*b1;
  CGenericHeader *b2;
  if(sizeof(CArcCompress)!=SlimProxReceive(con->sock,&head,sizeof (CArcCompress),0)) {
    return NULL;
  }
  if(head.compressed_size>0x80000)
    return NULL;
  b1=CAlloc(head.compressed_size+sizeof(CArcCompress));
  MemCpy(b1,&head,sizeof CArcCompress);
  SlimProxReceive(con->sock,b1+1,b1->compressed_size-sizeof(CArcCompress),0);
  b2=ExpandBuf(b1);
  Free(b1); 
  return b2;
}

Bool Server_MPConnectUpdateSidedefs(CMPConnect *con,CDoomLevel *l) {
  CDoomSidedef *sd,*head=&l->sidedefs; 
  CServerSidedef *srv_sd;
  CSidedefsHeader *msg;
  Bool changed=FALSE;
  U64 dummy;
  I64 cnt=0,change_cnt=0;
  if(!con->sidedefs)
    con->sidedefs=CAlloc(sizeof(CServerSidedef)*QueCnt(head));
  for(sd=head->next;sd!=head;sd=sd->next) {
    srv_sd=&con->sidedefs[cnt];
    srv_sd->idx=cnt;
    srv_sd->changed=FALSE;
    if(FramePtr(srv_sd->upper_texture,doom_task)!=sd->upper_texture[0]&&sd->upper_texture[0]) {
      changed=TRUE;
      srv_sd->changed=TRUE;
      StrCpy(srv_sd->upper_texture,GetUNStr(sd->upper_texture[0]));
    }

    if(FramePtr(srv_sd->lower_texture,doom_task)!=sd->lower_texture[0]&&sd->lower_texture[0]) {
      changed=TRUE;
      srv_sd->changed=TRUE;
      StrCpy(srv_sd->lower_texture,GetUNStr(sd->lower_texture[0]));
    }

    if(FramePtr(srv_sd->middle_texture,doom_task)!=sd->middle_texture[0]&&sd->middle_texture[0]) {
      changed=TRUE;
      srv_sd->changed=TRUE;
      StrCpy(srv_sd->middle_texture,GetUNStr(sd->middle_texture[0]));
    }

    if(srv_sd->changed)
      change_cnt++;
    cnt++;
  }

  if(change_cnt) {
    msg=CAlloc(sizeof(CServerSidedef)*change_cnt+sizeof(CSidedefsHeader));
    msg->ident=MSG_WORLD_SEND_SIDEDEFS;
    msg->sz=sizeof(CServerSidedef)*change_cnt+sizeof(CSidedefsHeader);
    cnt=0;
    change_cnt=0;
    for(sd=head->next;sd!=head;sd=sd->next) {
      srv_sd=&con->sidedefs[cnt];
      if(srv_sd->changed)
	MemCpy(&msg->body[change_cnt++],srv_sd,sizeof(CServerSidedef));
      cnt++;
    }
    SendMessage(con,msg);
    Free(msg);
  }

  return changed;
}

U0 SetAnimationFromFirst(CDC **arr) {
  if(GetFlatDC("NUKAGE1")==arr[0]) {
    arr[0]=GetFlatDC("NUKAGE1");
    arr[1]=GetFlatDC("NUKAGE2");
    arr[2]=GetFlatDC("NUKAGE3");
    arr[3]=GetFlatDC("NUKAGE4");
  } else if(GetFlatDC("FWATER1")==arr[0]) {
    arr[0]=GetFlatDC("FWATER1");
    arr[1]=GetFlatDC("FWATER2");
    arr[2]=GetFlatDC("FWATER3");
    arr[3]=GetFlatDC("FWATER4");
  } else if(GetFlatDC("LAVA1")==arr[0]) {
    arr[0]=GetFlatDC("LAVA1");
    arr[1]=GetFlatDC("LAVA2");
    arr[2]=GetFlatDC("LAVA3");
    arr[3]=GetFlatDC("LAVA4");
  } else if(GetFlatDC("BLOOD1")==arr[0]) {
    arr[0]=GetFlatDC("BLOOD1");
    arr[1]=GetFlatDC("BLOOD2");
    arr[2]=GetFlatDC("BLOOD3");
  } else if(GetFlatDC("RROCK05")==arr[0]) {
    arr[0]=GetFlatDC("RROCK05");
    arr[1]=GetFlatDC("RROCK06");
    arr[2]=GetFlatDC("RROCK07");
    arr[3]=GetFlatDC("RROCK08");
  } else if(GetFlatDC("SLIME01")==arr[0]) {
    arr[0]=GetFlatDC("SLIME01");
    arr[1]=GetFlatDC("SLIME02");
    arr[2]=GetFlatDC("SLIME03");
    arr[3]=GetFlatDC("SLIME04");
  } else if(GetFlatDC("SLIME05")==arr[0]) {
    arr[0]=GetFlatDC("SLIME05");
    arr[1]=GetFlatDC("SLIME06");
    arr[2]=GetFlatDC("SLIME07");
    arr[3]=GetFlatDC("SLIME08");
  } else if(GetFlatDC("SLIME09")==arr[0]) {
    arr[0]=GetFlatDC("SLIME09");
    arr[1]=GetFlatDC("SLIME10");
    arr[2]=GetFlatDC("SLIME11");
    arr[3]=GetFlatDC("SLIME12");
  } else {
    arr[1]=NULL;
    arr[2]=NULL;
    arr[3]=NULL;
  }
}

Bool Server_MPConnectUpdateSectors(CMPConnect *con,CDoomLevel *l) {
  CDoomSector *sec,*head=&l->sectors; 
  CServerSector *srv_sec;
  CSectorsHeader *msg;
  I64 cnt=0,change_cnt=0;
  Bool changed=FALSE;
  U64 dummy;
  if(!con->sectors)
    con->sectors=CAlloc(sizeof(CServerSector)*QueCnt(head));
  for(sec=head->next;sec!=head;sec=sec->next) {
    srv_sec=&con->sectors[cnt];
    srv_sec->idx=cnt;
    srv_sec->changed=FALSE;

    if(FramePtr(srv_sec->ceil_texture,doom_task)!=sec->ceil_dc[0]) {
      srv_sec->changed=TRUE;
      StrCpy(srv_sec->ceil_texture,GetUNStr(sec->ceil_dc[0]));
      changed=TRUE;
    }

    if(FramePtr(srv_sec->floor_texture,doom_task)!=sec->floor_dc[0]) {
      srv_sec->changed=TRUE;
      StrCpy(srv_sec->floor_texture,GetUNStr(sec->floor_dc[0]));
      changed=TRUE;
    }

    if(srv_sec->floor_height!=ToI64(sec->floor_height)) {
      changed=TRUE;
      srv_sec->changed=TRUE;
    }
    if(srv_sec->ceil_height!=ToI64(sec->ceil_height)) {
      changed=TRUE;
      srv_sec->changed=TRUE;
    }

    if(srv_sec->changed)
      change_cnt++;


    srv_sec->floor_height=ToI64(sec->floor_height);
    srv_sec->ceil_height=ToI64(sec->ceil_height);
    cnt++;
  }

  if(change_cnt) {
    msg=CAlloc(sizeof(CServerSector)*change_cnt+sizeof(CSectorsHeader));
    msg->ident=MSG_WORLD_SEND_SECTORS;
    msg->sz=sizeof(CServerSector)*change_cnt+sizeof(CSectorsHeader);
    //DbgPrint("sendin out %d sectors\n",change_cnt);
    cnt=0;
    change_cnt=0;
    for(sec=head->next;sec!=head;sec=sec->next) {
      srv_sec=&con->sectors[cnt];
      if(srv_sec->changed) {
        MemCpy(&msg->body[change_cnt++],srv_sec,sizeof(CServerSector));
      }
      cnt++;
    }
    SendMessage(con,msg);
    Free(msg);
  }
  return changed;
}

U0 SendThings(CMPConnect *con,CDoomLevel *l) {
  CI64Set *old;
  if(!con->last_sent_hashes) {
    old=I64SetNew;
  } else
    old=con->last_sent_hashes;
  con->last_sent_hashes=I64SetNew;
  I64 cnt=QueCnt(&l->things);
  if(cnt<0) return;
  I64 idx=0,dummy,hash,keep_idx=0;  
  U8 *s;
  CServerThing thing;
  CDoomThing *dt;
  CHashesHeader *keep=CAlloc(sizeof(CHashesHeader)+4*cnt);
  CThingsHeader *msg2=CAlloc(sizeof(CThingsHeader)+sizeof(CServerThing)*cnt);
  msg2->ident=MSG_SEND_THINGS;
  for(dt=l->things.next;dt!=&l->things;dt=dt->next) {
    if(dt!=con->player) {
      hash=MPHashThing(dt);
      I64SetAdd(con->last_sent_hashes,hash);
      if(!I64SetHas(old,hash)) {
        MemSet(&thing,0,sizeof(CServerThing));
        thing.x=dt->x;
        thing.y=dt->y;
        thing.h=dt->height;
        thing.health=dt->health;
        thing.old_x=dt->old_x;
        thing.old_y=dt->old_y;
        thing.old_h=dt->old_height;
        thing.angle=Wrap(dt->angle)/pi*I16_MAX;
        thing.anim_start_tS=dt->anim_start_tS;
        thing.anim_no_repeat=dt->anim_no_repeat;
        if(s=GetUNStr(dt->template)) StrCpy(thing.template,s);
        if(!dt->animation) dt->animation=dt->template->animation;
        if(s=GetUNStr(dt->animation)) {StrCpy(thing.anim_name,s);}
        else StrCpy(thing.anim_name,"");
        MemCpy(&msg2->body[idx++],&thing,sizeof(CServerThing));
      } else {
        keep->body[keep_idx++]=hash;
      }
    }
  }
  msg2->sz=sizeof(CThingsHeader)+sizeof(CServerThing)*idx;
  keep->ident=MSG_KEEP_HASHES;
  keep->sz=sizeof(CHashesHeader)+keep_idx*4;
  SendMessage(con,keep);
  SendMessage(con,msg2);
  Free(msg2);
  Free(keep);
  I64SetDel(old);
}

U0 ServerSendPlayerDamagePush(CDoomPlayer *player,F64 angle,F64 force,F64 damage) {
  if(!IsNetworkGameServer)
    return;
  CMPConnect *head=FramePtr("Srv.Connects"),*cur;
  CPlayerPush pp;
  for(cur=head->next;cur!=head;cur=cur->next) {
    if(cur->player==player) {
      pp.ident=MSG_DAMAGE_PUSH;
      pp.sz=sizeof(CPlayerPush);
      pp.angle=angle;
      pp.force=force;
      pp.damage=damage;
      SendMessage(cur,&pp);
      return;
    }
  }
}

U0 SendPlayerSpawnMissile(CMPConnect *con,CDoomPlayer *p,CD2 *to,CDoomThing *target,U64 type) {
  CMissileSend mss;
  mss.ident=MSG_PLAYER_MISSILE;
  mss.sz=sizeof(CMissileSend);
  mss.sx=p->x;
  mss.sy=p->y;
  if(target)
    to=&target->x;
  mss.ex=to->x;
  mss.ey=to->y;
  mss.type=type;
  if(target) mss.target_hash=MPHashThing(target);
  else mss.target_hash=0;
 SendMessage(con,&mss);
}
U0 KeepHashes(CMPConnect *con,CHashesHeader *got) {
  if(!con->keep_hashes)
    con->keep_hashes=I64SetNew;
  else
    con->keep_hashes->cnt=0;
  I64 cnt=(got->sz-sizeof(CHashesHeader))/4;
  while(--cnt>=0)
   I64SetAdd(con->keep_hashes,got->body[cnt]);
}
U0 RecieveThings(CMPConnect *con,CDoomLevel *l,CThingsHeader *got) {
//If we picked up an item,be sure to discard previous instances of the pickup
  // before the time we picked up the item
  if(con->flags&CONNECTF_NO_REFRESH_THINGS) {
    return;
  }
  I64 cnt=(got->sz-sizeof(CThingsHeader))/sizeof(CServerThing);
  I64 idx;  
  CDoomThing *dt,*next;
  CServerThing *st=got->body;
  for(dt=l->things.next;dt!=&l->things;dt=next) {
    next=dt->next;
    if(dt!=con->player) {
      if(con->keep_hashes) {
//Heres the deal,use old position as we want the old hash to be the same.
        if(I64SetHas(con->keep_hashes,MPHashThing(dt))) {
	  goto skip;
        }
      }
      if(dt->thinker) {
        QueRem(dt->thinker);
        Free(dt->thinker);
        dt->thinker=NULL;
      }
      ThingDel(l,dt);
    }
skip:;
  }
  for(idx=0;idx!=cnt;idx++) {
    dt=CAlloc(sizeof(CDoomThing),doom_task);
    QueIns(dt,l->things.last);
    dt->x=st->x;
    dt->y=st->y;
    dt->height=st->h;
    dt->new_x=st->x;
    dt->new_y=st->y;
    dt->new_height=st->h;
    dt->old_x=st->old_x;
    dt->old_y=st->old_y;
    dt->old_height=st->old_h;
    InitPosDataForThing(l,dt);
    dt->angle=ToF64(st->angle)/I16_MAX*pi;
    dt->anim_start_tS=st->anim_start_tS;
    dt->anim_no_repeat=st->anim_no_repeat;
    dt->template=FramePtr(st->template,doom_task);
    dt->animation=FramePtr(st->anim_name,doom_task);
    dt->flags=dt->template->flags;
    dt->health=st->health;
    if(dt->health<=0.) {
      dt->flags&=~(TF_OBSTACLE|TF_SHOOTABLE);
    }
    st++;
  }
  con->flags&=~CONNECTF_WANTS_THINGS;
}
U0 SendPlayerAttack(CMPConnect *con,CDoomLevel *l,CDoomPlayer *p,CDoomThing *tar,F64 damage,F64 range) {
  CPlayerAttack at;
  F64 angle;
  if(tar)
    angle=FArg(tar->x-p->x,tar->y-p->y);
  else
    angle=p->angle;
  at.ident=MSG_PLAYER_ATTACK;
  at.sz=sizeof(CPlayerAttack);
  if(tar)
    at.target_hash=MPHashThing(tar);
  else
    at.target_hash=0;
  at.damage=damage;
  at.range=range;
  at.fallback_angle=Wrap(angle)/pi*I16_MAX;
  SendMessage(con,&at);
}
U0 SendPlayerUpdateServer(CMPConnect *con,CDoomPlayer *p) {
  CThingsHeader *hdr=CAlloc(sizeof(CThingsHeader)+sizeof(CServerPlayer));
  CServerPlayer *sp;
  CSTMessageHeader st_msg;
  I64 idx,more;
  U8 *got;
  hdr->sz=sizeof(CThingsHeader)+sizeof(CServerPlayer);
  hdr->ident=MSG_SEND_PLAYER;
  sp=&hdr->body;
  sp->has_red_key=l->has_red_key;
  sp->has_blue_key=l->has_blue_key;
  sp->has_yellow_key=l->has_yellow_key;
  SendMessage(con,hdr);
  while(FifoI64Rem(p->messages,&got)) {
    st_msg.ident=MSG_ST_MESSAGE;
    st_msg.sz=sizeof(CSTMessageHeader);
    StrCpy(st_msg.msg,got);
    SendMessage(con,&st_msg);
    Free(got);
  }
  Free(hdr);
}
U0 SendPlayerUpdateClient(CMPConnect *con,CDoomPlayer *p) {
  CThingsHeader *hdr=CAlloc(sizeof(CThingsHeader)+sizeof(CServerPlayer));
  CServerPlayer *sp;
  I64 idx;
  hdr->sz=sizeof(CThingsHeader)+sizeof(CServerPlayer);
  hdr->ident=MSG_SEND_PLAYER;
  sp=&hdr->body;
  sp->x=p->x;
  sp->y=p->y;
  sp->h=p->height;
  sp->health=p->health;
  sp->max_bullets=maxBullets;
  sp->max_rockets=maxRockets;
  sp->max_shells=maxShells;
  sp->max_cells=maxCells;
  sp->angle=Wrap(p->angle)/pi*I16_MAX;
  sp->has_red_key=l->has_red_key;
  sp->has_blue_key=l->has_blue_key;
  sp->has_yellow_key=l->has_yellow_key;
  SendMessage(con,hdr);
  Free(hdr);
}
U0 ReadPlayerUpdateClient(CMPConnect *con,CThingsHeader *hh) {
  CDoomPlayer *p=con->player;
  if(!p) return;
  CServerPlayer *thg=hh->body;
  I64 idx,more;
//Cleint's handle the position
  l->has_red_key|=thg->has_red_key;
  l->has_blue_key|=thg->has_blue_key;
  l->has_yellow_key|=thg->has_yellow_key;
}

U0 SendPickup(CMPConnect *con,CDoomThing *thing) {
  con->flags|=CONNECTF_NO_REFRESH_THINGS;
  con->last_recieve_things_tS=Server_tS;
  CPickupHeader puh;
  puh.ident=MSG_ITEM_PICKUP;
  puh.sz=sizeof(CPickupHeader);
  puh.x=thing->x;
  puh.y=thing->y;
  puh.type=thing->template->type;
  SendMessage(con,&puh);
}


U0 ReadPlayerUpdateServer(CMPConnect *con,CThingsHeader *hh) {
  CDoomPlayer *p=con->player;
  if(!p) return;
  CServerPlayer *thg=hh->body;
  I64 idx,more;
//Cleint's handle the position
  //DbgPrint("Server gxt player(%d,%d,%n)\n",thg->x,thg->y,thg->health); 
  RemovePosDataForThing(l,p);
  p->x=thg->x;
  p->y=thg->y;
  p->height=thg->h;  
  p->health=thg->health;
  p->angle=thg->angle/ToF64(I16_MAX)*pi;
  l->has_red_key|=thg->has_red_key;
  l->has_blue_key|=thg->has_blue_key;
  l->has_yellow_key|=thg->has_yellow_key;
  InitPosDataForThing(l,p);
}


U0 MPClientSync(CMPConnect *con,CDoomLevel *l) {
  CGenericHeader msg;
  SendPlayerUpdateClient(con,con->player);
  msg.sz=sizeof(CGenericHeader);
  msg.ident=MSG_WANT_UPDATE;
  SendMessage(con,&msg);
}
U0 ServerExit() {
  CMPConnect *head=FramePtr("Srv.Connects"),*cur,*next;
  for(cur=head->next;cur!=head;cur=next) {
    next=cur->next;
    SlimProxClose(cur->sock);
    Free(cur);
  }
  Free(head);
  SlimProxClose(FramePtr("Srv.Socket"));
  Exit;
}
CMPConnect *MPCloseConnect(CMPConnect *con) {
  CMPConnect *next=con->next;
  CDoomPlayer *p;
  if(p=con->player) {
    p->anim_start_tS=Server_tS;
    p->anim_no_repeat=TRUE;
    p->animation=p->template(CDoomMonsterTemplate*)->_gib_frames;
    p->health=0;
    p->flags&=~TF_OBSTACLE;
  }
  Free(con->sidedefs);
  Free(con->sectors);
  SlimProxClose(con->sock);
  QueRem(con);
  Free(con);
  return next;
}
U0 ServerReadTask(CMPConnect *connection) {
  CGenericHeader *msg;
  CDoomThing *dthing;
  CMPConnect *connects=FramePtr("Srv.Connects"),*next_con;
  F64 angle;
  CD2 dummy;
  while(msg=GetMessage(connection)) {
    connection->flags|=CONNECTF_BEGUN;
    WorldLock(1);
    if(msg->ident==MSG_SAY_SOMETHING) {
      msg->ident=MSG_ST_MESSAGE;
      for(next_con=connects->next;next_con!=connects;next_con=next_con->next) {
	if(next_con!=connection)
          SendMessage(next_con,msg);
      }
    } else if(msg->ident==MSG_PRESS_A_WALL) {
      dummy.x=msg(CWallPress*)->x;
      dummy.y=msg(CWallPress*)->y;
      angle=ToF64(msg(CWallPress*)->angle)/I16_MAX*pi;     
      PressAWall(l,&dummy,angle,msg(CWallPress*)->height);
    } else if(msg->ident==MSG_HASH_THINGS) {
wtf:
      //DbgPrint("WTF\n");
    } else if(msg->ident==MSG_WANT_HASH_THINGS) {
    } else if(msg->ident==MSG_WANT_UPDATE) {
      if(connection->flags&CONNECTF_READY)
        SendThings(connection,l);
//Frist message we want is MSG_WANT_THINGS
    } else if(msg->ident==MSG_SEND_THINGS) {
      goto wtf;
    } else if(msg->ident==MSG_TRIGGER_LINEDEF) {
      CLinedefSend *ld_send=msg;
      if(connection->player) {
	connection->player->x=ld_send->x;
	connection->player->y=ld_send->y;
        //DbgPrint("Client triggers linedef(%d) with flags %X,%X\n",ld_send->ld_idx,ld_send->flags,connection->player);
        TriggerLinedef(l,GetNthLinedef(l,ld_send->ld_idx),ld_send->flags,connection->player);
      }
    } else if(msg->ident==MSG_PLAYER_ATTACK) {
      CPlayerAttack *patk=msg;
      if(!connection->player)
	goto after_player_attack;
      connection->player->made_a_sound=TRUE;
      //DbgPrint("Player begins attack\n");
//Help with autoaim(fallback_angle)
      connection->player->angle=patk->fallback_angle/ToF64(I16_MAX)*pi;
      dthing=PlayerPickTarget(l,connection->player);
//Fallback
      //DbgPrint("Player attack target(%d),fallback angle(%n)\n",dthing,patk->fallback_angle/ToF64(I16_MAX)*180.);
      LineAttack(l,connection->player,dthing,
	    patk->range,
	    patk->fallback_angle/ToF64(I16_MAX)*pi,
	    patk->damage);
after_player_attack:;
    } else if(msg->ident==MSG_PLAYER_MISSILE) {
      CMissileSend *missile_send=msg;
      connection->player->made_a_sound=TRUE;
      //DbgPrint("Player spawns missile(type %c)\n",missile_send->type);
      for(dthing=l->things.next;dthing!=&l->things;dthing=dthing->next) {
        if(missile_send->target_hash==MPHashThing(dthing)) {
	  //DbgPrint("Player finds target to fire missile at\n");
	  SpawnMissile(l,connection->player,dthing,missile_send->type);
	  goto after_missile_attack;
        }
      }
      /*DbgPrint("Player blind fires missoile(no matched target at %n)\n",
	    180/pi*FArg(
	    missile_send->ex-missile_send->sx,
	    missile_send->ey-missile_send->sy
	    )
      );*/
      angle=connection->player->angle;
      connection->player->angle=FArg(
	    missile_send->ex-missile_send->sx,
	    missile_send->ey-missile_send->sy
	    );
      SpawnMissile(l,connection->player,NULL,missile_send->type);
      connection->player->angle=angle;
after_missile_attack:;
    }else if(msg->ident==MSG_SEND_PLAYER) {
      ReadPlayerUpdateServer(connection,msg);
    } else if(msg->ident==MSG_ITEM_PICKUP) {
      CPickupHeader *puh=msg;
      for(dthing=l->things.next;dthing!=&l->things;dthing=dthing->next) {
        if(ToI64(dthing->x)/2==puh->x/2&&
		ToI64(dthing->y)/2==puh->y/2&&
		dthing->template->type==puh->type&&
		dthing->flags&(TF_ARTIFACT|TF_POWERUP)) {
	  //DbgPrint("Player pickup item hash matched\n");
	  SendMessage(connection,msg);
	  ThingDel(l,dthing);
	  break;
        }
        SendMessage(connection,msg);
      }
    } else if(msg->ident==MSG_PLAY_SOUND) {
      CSoundHeader *shdr=msg;
      //DbgPrint("Sound %s is at %d,%d\n",shdr->name,shdr->x,shdr->y);
      for(next_con=connects->next;next_con!=connects;next_con=next_con->next)
        if(next_con!=connection)
	  SendMessage(next_con,shdr);
    } else if(msg->ident==MSG_SERVER_WHAT_LEVEL) {
      //DbgPrint("Cleint asks what level\n");
      CWhatLevelHeader what_lvl;
      what_lvl.server_tS=Server_tS;
      what_lvl.ident=MSG_SERVER_WHAT_LEVEL;
      what_lvl.sz=sizeof(CWhatLevelHeader);
      what_lvl.spawn_x=FramePtr("Server.SpawnX");
      what_lvl.spawn_y=FramePtr("Server.SpawnY");
      StrCpy(what_lvl.map_name,l->map_name);
      what_lvl.skill=l->skill;
      what_lvl.fresh_player=FALSE;
      if(!connection->player) {
        connection->player=PlayerNew(l);
	what_lvl.fresh_player=TRUE;
      }
      connection->player->x=what_lvl.spawn_x;
      connection->player->y=what_lvl.spawn_y;
      SendMessage(connection,&what_lvl);
      connection->flags|=CONNECTF_READY;
    } else {
//Fuck TODO give client a decription of error
      //close connection
      //DbgPrint("Ohg fuck closing connection(got %c)\n",msg->ident);
      WorldUnlock(1);
      MPCloseConnect(connection);
      Free(msg);
      Exit;
    }
    Free(msg);
    WorldUnlock(1);
  }
  MPCloseConnect(connection);
}

U0 ServerAcceptTask(I64) {
  I64 listen_sock=FramePtr("Srv.Socket");
  I64 who;
  Bool avail[16];
  CDoomPlayer *p;
  CMPConnect *connects=FramePtr("Srv.Connects"),*new,*next_con;
  while(who=SlimProxAccept(listen_sock,NULL,0)) {
    if(who!=-1)  {
//DbgPrint("nw client:\n");
      new=connects->next;
      MemSet(avail,TRUE,16);
      for(idx=QueCnt(connects)-1;idx>=0;idx--) {
        avail[new->player_num]=FALSE;
        new=new->next;
      }
      for(idx=0;idx!=16;idx++) {
        if(avail[idx]) {
	  new=CAlloc(sizeof(CMPConnect),doom_task);
	  new->sock=who;
	  new->player_num=idx;
	  QueIns(new,connects);
	  Spawn(&ServerReadTask,new,"Accept",0,Fs);
	  goto pass;
        }
      }
//TODO game full Or some shit
//DbgPrint("game full\n");
      SlimProxClose(who);
    } else {
     break;
    }
pass:;
  }
}

U0 ServerUpdate(I64) {
  I64 listen_sock=FramePtr("Srv.Socket"),idx,new_sock;
  CMPConnect *connects=FramePtr("Srv.Connects"),*new,*next_con;
  F64 angle;
  CDoomPlayer *p;
  CDoomThing *dthing;
  CGenericHeader *msg;
  U8 *buf;
  CWhatTimeHeader wt;
  for(dthing=l->things.next;dthing!=&l->things;dthing=dthing->next) {
    dthing->old_x=dthing->x;
    dthing->old_y=dthing->y;
    dthing->old_height=dthing->height;
  }
  while(TRUE) {
    wt.sz=sizeof(CWhatTimeHeader);
    wt.ident=MSG_WHAT_TIME;
    wt.server_tS=Server_tS;
    for(next_con=connects->next;next_con!=connects;next_con=next_con->next) {
      if(next_con->flags&CONNECTF_BEGUN) {
	if(next_con->flags&CONNECTF_READY) {
	  if(next_con->player) SendPlayerUpdateServer(next_con,next_con->player);
          SendMessage(next_con,&wt);
	  WorldLock;
          Server_MPConnectUpdateSidedefs(next_con,l);
          Server_MPConnectUpdateSectors(next_con,l);
	  WorldUnlock;
	}
      }
    }
    WorldLock;
    for(dthing=l->things.next;dthing!=&l->things;dthing=dthing->next) {
      dthing->old_x=dthing->x;
      dthing->old_y=dthing->y;
      dthing->old_height=dthing->height;
    }
    WorldUnlock;
    Sleep(30);
  }
}
//This function is re-callable(Call again for level transition).
U0 ServerBegin(U16 port=TOOM_PORT) {
  if(FramePtr("Srv.Connects")) return ;
  I64 listen_sock=SlimProxCreateServer("0.0.0.0",port,0x10);
  CMPConnect *connects=CAlloc(sizeof CQue);
  QueInit(connects);
  FramePtrAdd("Srv.Connects",connects);
  FramePtrAdd("Srv.Socket",listen_sock);
  Spawn(&ServerAcceptTask,NULL,"Accept",0,Fs);
  Spawn(&ServerUpdate,NULL,"update",0,Fs);
}
Bool IsNetworkGameClient() {
  if(FramePtr("Client.Connect"))
    return TRUE;
  return FALSE;
}

Bool IsNetworkGameServer() {
  if(FramePtr("Srv.Active"))
    return TRUE;
  return FALSE;
}

U0 ClientDisconnect() {
  CMPConnect *c=FramePtr("Client.Connect");
  Free(c);
  SlimProxClose(FramePtr("Client.Sock"));
}
U0 ClientReadTask(I64) {
  I64 listen_sock=FramePtr("Client.Sock");
  CMPConnect *connect=FramePtr("Client.Connect");
  CGenericHeader *msg;
  I64 cnt;
  CServerSidedef *srv_sd;
  CServerSector *srv_sec;
  CDoomSidedef *sd;
  CDoomSector *sec;
  CDoomPlayer *player;
  CSTMessageHeader *st_msg;
  MPClientSync(connect,l); //Initial placement of thigns
  while(msg=GetMessage(connect)) {
    connect->flags|=CONNECTF_READY;
    WorldLock(1);
    if(msg->ident==MSG_DAMAGE_PUSH) {
      if(player=connect->player) {
	player->momx+=msg(CPlayerPush*)->force*Cos(msg(CPlayerPush*)->angle);
	player->momy+=msg(CPlayerPush*)->force*Sin(msg(CPlayerPush*)->angle);
      }
      DamagePlayer(player,msg(CPlayerPush*)->damage);
    } else if(msg->ident==MSG_ITEM_PICKUP) {
	//We send back the pickup if we picked up an item,we send back the pickup
        //This acts as an barrier between the pickup and receiving things again(dont pickup the same item twice)
	connect->flags&=~CONNECTF_NO_REFRESH_THINGS;
    } else if(msg->ident==MSG_ST_MESSAGE) {
      st_msg=msg;
      ST_Message(connect->player,st_msg->msg);
    } else if(msg->ident==MSG_SEND_PLAYER) {
      ReadPlayerUpdateClient(connect,msg);
    } else  if(msg->ident==MSG_HASH_THINGS) {
    } else if(msg->ident==MSG_PLAY_SOUND) {
        CSoundHeader *snd=msg;
        //DbgPrint("Cleint gxt a sound(%s)\n",snd->name);
        Spawn(&PlaySoundTask,snd->name,"snd",0,Fs);
    } else if(msg->ident==MSG_WORLD_SEND_SIDEDEFS) {
        CSidedefsHeader *sidedefs=msg;
        cnt=sidedefs->sz/sizeof(CServerSidedef);
        //DbgPrint("Cleint gxt %d sidedefs\n",cnt);
        while(--cnt>=0) {
	  srv_sd=&sidedefs->body[cnt];
	  if(srv_sd->idx!=-1) {
	    sd=GetNthSidedef(l,srv_sd->idx);
	    sd->upper_texture[0]=FramePtr(srv_sd->upper_texture,doom_task);
	    sd->middle_texture[0]=FramePtr(srv_sd->middle_texture,doom_task);
	    sd->lower_texture[0]=FramePtr(srv_sd->lower_texture,doom_task);
	    /*DbgPrint("sd(%d)%s,%s,%s\n",
		  srv_sd->idx,
		  srv_sd->upper_texture,
		  srv_sd->middle_texture,
		  srv_sd->lower_texture
		  );*/
	  }
        }
    } else if(msg->ident==MSG_WORLD_SEND_SECTORS) {
        CSectorsHeader *sectors=msg;
        cnt=(sectors->sz-sizeof(CSectorsHeader))/sizeof(CServerSector);
        //DbgPrint("Cleint gxt %d sectors\n",cnt);
        while(--cnt>=0) {
	  srv_sec=&sectors->body[cnt];
	  sec=GetNthSector(l,srv_sec->idx);
	  if(FramePtr(srv_sec->ceil_texture,doom_task)) sec->ceil_dc[0]=FramePtr(srv_sec->ceil_texture,doom_task);
	  if(FramePtr(srv_sec->floor_texture,doom_task)) sec->floor_dc[0]=FramePtr(srv_sec->floor_texture,doom_task);
          SetAnimationFromFirst(sec->ceil_dc);
          SetAnimationFromFirst(sec->floor_dc);
	  sec->floor_height=srv_sec->floor_height;
	  sec->ceil_height=srv_sec->ceil_height;
	  /*DbgPrint("sec(%d)%d,%d,%s,%s\n",
	        srv_sec->idx,
	        srv_sec->floor_height,
	        srv_sec->ceil_height,
	        srv_sec->floor_texture,
	        srv_sec->ceil_texture
	        );*/
        }
      } else if(msg->ident==MSG_KEEP_HASHES) {
	KeepHashes(connect,msg);
      } else if(msg->ident==MSG_SEND_THINGS) {
        RecieveThings(connect,l,msg);
      } else if(msg->ident==MSG_TELEPORT_PLAYER) {
	CTeleportHeader *tele=msg;
	if(connect->player) {
	  connect->player->x=tele->x;
	  connect->player->y=tele->y;
	  connect->player->angle=tele->angle/ToI64(I16_MAX)*pi;
	}
      } else if(msg->ident==MSG_WHAT_TIME) {
        base_tS=tS;
        time_offset=msg(CWhatTimeHeader*)->server_tS;
      } else if(msg->ident==MSG_END_LEVEL) {
	l->ended=TRUE;
	QueRem(connect->player); //Reinsert later
        WorldUnlock(1);
        Kill(connect->update,FALSE);
        //Kill(connect->read,FALSE); //Kill yourself?
	connect->flags=0;
	Free(connect->sectors),Free(connect->sidedefs);
	if(connect->last_sent_hashes)
	  connect->last_sent_hashes->cnt=0;
	if(connect->keep_hashes)
	  connect->keep_hashes->cnt=0;
	connect->sidedefs=NULL;
	connect->sectors=NULL;
	Exit; //Just Exit
      } else {
        //DbgPrint("Cleint gxt a mother fuckun weird resonse(%c)\n",msg->ident);
      }
pass:;
      WorldUnlock(1);
      Free(msg);
  }
}
Bool ClientUpdateTask(CMPConnect *c) {
  CDoomThing *dthing;
  F64 period=60./1000.;
  F64 next_refresh=tS+period,r,last=c->last_recieve_things_tS;
  while(TRUE) {
    MPClientSync(c,l);
    if(last!=c->last_recieve_things_tS) {
      period=c->last_recieve_things_tS-last;
      last=c->last_recieve_things_tS;
      if(next_refresh<tS) {
        next_refresh=tS+period;
      }
    }
    Refresh;
  }
}
//
//This is a "reusable" function,feel free to call it again(on level transition)
//
Bool ClientBegin(U8 *who,I64 port=TOOM_PORT) {
  Bool success=TRUE;
  CMPConnect *connect=FramePtr("Client.Connect");
  CDoomLevel *oldl=l;
  if(connect) {
    goto start_game;
  } 
  I64 listen_sock;
  listen_sock=SlimProxCreateConnection(who,port);
  if(listen_sock<0) return FALSE;
  CWhatLevelHeader what_lvl,*msg;
  CDoomThing *thing,*nthing;
  connect=CAlloc(sizeof(CMPConnect));
  connect->sock=listen_sock;
  Fs->task_end_cb=&ClientDisconnect;
  FramePtrAdd("Client.Sock",listen_sock);
  FramePtrAdd("Client.Connect",connect);
start_game:;
  what_lvl.ident=MSG_SERVER_WHAT_LEVEL;
  what_lvl.sz=sizeof CGenericHeader;
  SendMessage(connect,&what_lvl);
  while(TRUE) {
      msg=GetMessage(connect);
PrintI(&msg->ident,msg);
      if(!msg) {
        success=FALSE;
	break;
      }
      if(msg->ident==MSG_SERVER_WHAT_LEVEL) {
//TODO load level multiplayer
        base_tS=tS;
        time_offset=msg->server_tS;
	if(l=LoadWadLevel(msg->map_name,msg->skill)) {
  	  //DbgPrint("Server is on map %s skill %d\n",msg->map_name,msg->skill);
	  if(oldl) FreeLevel(oldl);
          for(thing=l->things.next;thing!=&l->things;thing=nthing) {
	    nthing=thing->next;
	    ThingDel(l,thing);
	  }
//TODO server level transitions
	  if(!connect->player) {
	    p=PlayerNew(l);
	    connect->player=p;
	  } else if(msg->fresh_player) { //Maybe we died
//Make a fresh player
	    p=PlayerNew(l);
	    connect->player=p;
	  } else {
	    p=connect->player;
            QueIns(p,&l->things);
	    InitPosDataForThing(l,p);
	  }
          p->x=msg->spawn_x;
          p->y=msg->spawn_y;
	  p->height=GetSectorForCoord(l,p->x,p->y)->floor_height;
	  connect->read=Spawn(&ClientReadTask,connect,"CleintRead",0,Fs);
	  connect->update=Spawn(&ClientUpdateTask,connect,"CleintUpdate",0,Fs);
	  Free(msg);
	  break;
	} else {
//TODO inform client something bad happended
	  SlimProxClose(connect->sock);
          Free(connect);
	  success=FALSE;
	  break;
	}
	
      } else 
	Free(msg);
  }
  return success;
}

U0 ClientPlaySound(U8 *name) {
  CMPConnect *connect=FramePtr("Client.Connect");
  if(IsNetworkGameClient) {
    CSoundHeader hdr;
    hdr.ident=MSG_PLAY_SOUND;
    hdr.sz=sizeof(CSoundHeader);
    StrCpy(hdr.name,name);
    //DbgPrint("Cleint sent sound %s\n",name);
    SendMessage(connect,&hdr);
  } else {
    Spawn(&PlaySoundTask,name,"snd",0,Fs);
  }
}
U0 ServerTeleportPlayer(CDoomThing *p,F64 x,F64 y,F64 angle) {
  CMPConnect *head=FramePtr("Srv.Connects"),*cur;
  if(!head) return;
  CTeleportHeader tele;
  tele.ident=MSG_TELEPORT_PLAYER;
  tele.sz=sizeof(CTeleportHeader);
  tele.x=x;
  tele.y=y;
  tele.angle=Wrap(angle)/pi*I16_MAX;
  for(cur=head->next;cur!=head;cur=cur->next) {
    if(cur->player==p) {
      SendMessage(cur,&tele);
    }
  }
}
//Returns true if should also be handled by client
Bool ClientTriggerLinedef(CDoomLevel *l,CDoomLinedef *ld,I64 flags=0,CDoomThing *t) {
  if(!IsNetworkGameClient) {
     return TriggerLinedef(l,ld,flags,t);
  }
  if(!ld->special_type) return FALSE;
  CMPConnect *con=FramePtr("Client.Connect");
  CLinedefSend lds;
  lds.ident=MSG_TRIGGER_LINEDEF;
  lds.sz=sizeof(CLinedefSend);
  lds.ld_idx=GetLinedefIndex(l,ld);
  lds.flags=flags;
  lds.x=t->x;
  lds.y=t->y;
  SendMessage(con,&lds);
//This is appriate to send on client side too
  if(ld->special_type->type=='Teleport') {
    return TRUE;
  }
  return TRUE;
}

U0 ClientPlayerLineAttack(CDoomLevel *l,CDoomPlayer *p,CDoomThing *target,F64 range,F64 angle,F64 damage,Bool melee=FALSE) {
  if(!IsNetworkGameClient) {
    LineAttack(l,p,target,range,angle,damage,melee);
    return;
  }
  SendPlayerAttack(FramePtr("Client.Connect"),l,p,target,damage,range);
}
U0 ClientPlayerSpawnMissile(CDoomLevel *l,CDoomPlayer *p,CDoomThing *target,U64 type) {
  if(!IsNetworkGameClient) {
    SpawnMissile(l,p,target,type);
    return;
  }
  CD2 towards;
  towards.x=Cos(p->angle)*100+p->x;
  towards.y=Sin(p->angle)*100+p->y;
  SendPlayerSpawnMissile(FramePtr("Client.Connect"),p,&towards,target,type);
}
U0 ClientPressAWall(CDoomLevel *l,CDoomPlayer *p) {
  CWallPress press;  
  if(!IsNetworkGameClient) {
    PressAWall(l,&p->x,p->angle,p->height);
    return;
  }
  CMPConnect *con=FramePtr("Client.Connect");
  press.ident=MSG_PRESS_A_WALL;
  press.sz=sizeof(CWallPress);
  press.x=p->x;
  press.y=p->y;
  press.angle=Wrap(p->angle)/pi*I16_MAX;
  press.height=p->height;
  SendMessage(con,&press);
}
Bool IsEveryoneDead() {
  CMPConnect *head=FramePtr("Srv.Connects"),*cur;
  Bool player_in_game=FALSE;
  for(cur=head->next;cur!=head;cur=cur->next) {
    if(cur->player) {
      player_in_game=TRUE;
      if(cur->player->health>=1.)
	return FALSE;
    }
  }
//Dont return TRUE if no players are in the game
  return player_in_game;
}
U0 ServeGame(U8 *map_name,I64 skill) {
  if(l) FreeLevel(l);
  CDoomThing *t,*next;
  U8 *next_map,restart,dummy[16];
  CMPConnect *mp_con,*head;
  CEndLevelHeader end_hdr;
  FramePtrAdd("Srv.Active",1);
  l=LoadWadLevel(map_name,skill);
again:; 
  for(t=l->things.next;t!=&l->things;t=next) {
    next=t->next;
    if(t->template->type==1) {
      FramePtrAdd("Server.SpawnX",t->x);
      FramePtrAdd("Server.SpawnY",t->y);
      ThingDel(l,t);
    }
  }
  InitLevel(l);
  head=FramePtr("Srv.Connects");
  if(head) {
    for(mp_con=head->next;head!=mp_con;mp_con=mp_con->next) {
      if(mp_con->player) {
        QueIns(mp_con->player,l->things.last);
        mp_con->player->x=FramePtr("Server.SpawnX");
        mp_con->player->y=FramePtr("Server.SpawnY");
      }
    }
  }
  ServerBegin;
  "Press A Key to stop serving\n";
  FlushMsgs;
  restart=FALSE;
  while(!l->ended) { //TODO check if won game and all clients disonnected
    if(ScanKey) 
      break;
    WorldLock;
    UpdateLevel(l);
    WorldUnlock;
    if(IsEveryoneDead) {
      restart=TRUE;
      StrCpy(dummy,l->map_name);
      next_map=dummy;
      goto next_level;
    }
    Sleep(50);
  }
  next_map=NextLevel(l->map_name,l->ended_special);
next_level:;
  WorldLock;
  head=FramePtr("Srv.Connects");
  end_hdr.sz=sizeof(CEndLevelHeader);
  end_hdr.ident=MSG_END_LEVEL;
  for(mp_con=head->next;head!=mp_con;mp_con=mp_con->next) {
    Free(mp_con->sectors);
    Free(mp_con->sidedefs);
    mp_con->sectors=NULL;
    mp_con->sidedefs=NULL;
    if(mp_con->last_sent_hashes)
      mp_con->last_sent_hashes->cnt=0;
    mp_con->flags=0;
    if(mp_con->player) {
      if(mp_con->player->health<1.)  {
        ThingDel(l,mp_con->player);
        mp_con->player=NULL;
      } else 
        QueRem(mp_con->player); //Will be re-inserted into the level
    }
    SendMessage(mp_con,&end_hdr);
  }
  FreeLevel(l);
  l=NULL;
  if(map_name=next_map) {
    l=LoadWadLevel(map_name,skill);
    WorldUnlock;
    goto again;
  }
  WorldUnlock;
}
U0 PlayNetworkGame(U8 *at="0.0.0.0",I64 port=TOOM_PORT) {
again:;
  if(ClientBegin(at,port)) {
    PlayLevel(FALSE);
    goto again;
  }
}
//Returns true if consumes controls
Bool MPTalk(CDC *dc,CMPConnect *con) {
  static U8 say[STR_LEN];
  static I64 init=0;
  if(!init) {
    init=1;
    StrCpy(say,"");
  } 
  CSTMessageHeader hdr;
  MemSet(&hdr,0,sizeof(CSTMessageHeader));
  hdr.ident=MSG_SAY_SOMETHING;
  hdr.sz=sizeof(CSTMessageHeader);
  I64 l;
  I64 m1,m2;
  while(ScanKey(&m1,&m2)) {
    if(m1==CH_BACKSPACE) {
      if(l=StrLen(say)) {
	say[l-1]=0;
      }
    } else if(m1=='\n') {
      if(l=StrLen(say)) {
	StrCpy(hdr.msg,say);
        SendMessage(con,&hdr);
	StrCpy(hdr.msg,"");
      }
      return  FALSE;
    } else if(m1==CH_ESC) {
      StrCpy(say,"");
      return FALSE;
    } else if(Bt(char_bmp_displayable,m1)) {
      if(StrLen(say)<STR_LEN-1)
        CatPrint(say,"%c",m1);
    }
  }
  if(Blink)
    DoomPrint(dc,10,dc->height-80,"Say: %s_",say);
  else
    DoomPrint(dc,10,dc->height-80,"Say: %s",say);
  return TRUE;
}
#endif
