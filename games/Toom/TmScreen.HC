U0 GameDraw(Game *tmpg,CDC *dc)
{//Render a stable level into a private DC without advancing simulation.
  Level *level;
  View *view;
  World *world;
  Actor *player,*actor;
  I64 id;
  GameEnter(tmpg);
  try {
    level=tmpg->level;
    if (!level) throw('Level');
    if (dc->width<TM_VIEW_WIDTH*2 || dc->height<TM_VIEW_HEIGHT*2)
      throw('View');
    world=level->world; WorldIdle(world);
    player=WorldActorGet(world,world->player);
    if (!player) throw('Player');
    view=level->view;
    view->x=player->x/65536.0; view->y=player->y/65536.0;
    view->z=level->player.view_z/65536.0;
    if (!world->tic)
      view->z=MinI64(player->z+TM_EYE_HEIGHT,player->ceil-4*65536)/65536.0;
    view->angle=player->angle*6.283185307179586/4294967296.0;
    ViewDraw(view); ViewMasked(view);
    id=world->first;
    while (actor=WorldActorGet(world,id,FALSE)) {
      if (actor!=player) SpriteDraw(view,tmpg->sprites,actor);
      id=actor->tick_next;
    }
    ViewBlot(view,dc);
  } catch {
    GameLeave(tmpg);
  }
  GameLeave(tmpg);
}
