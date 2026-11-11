U0 MotionTouch(Motion *tmpm,Actor *mover,Actor *other,I64 kind)
{//Contact classification has already checked boxes, species and height.
  World *world=tmpm->world;
  ActorInfo *info;
  I64 damage;
  if (mover->world!=world || other->world!=world) throw('World');
  if (!mover->active || !other->active) return;
  switch (kind) {
    case TM_CONTACT_PICKUP:
      PlayerTouch(tmpm,mover,other);
      break;
    case TM_CONTACT_MISSILE:
      damage=(WorldRand(world)%8+1)*world->data->info[mover->type].damage;
      ActorDamage(tmpm,other,mover,WorldActorGet(world,mover->target),damage);
      break;
    case TM_CONTACT_SKULL:
      info=world->data->info+mover->type;
      damage=(WorldRand(world)%8+1)*info->damage;
      ActorDamage(tmpm,other,mover,mover,damage);
      mover->flags&=~TM_MF_SKULLFLY; mover->vx=mover->vy=mover->vz=0;
      ActorState(world->data,mover,info->spawn,tmpm->action);
      break;
    default: throw('Contact');
  }
}
