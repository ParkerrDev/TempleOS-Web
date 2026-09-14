U0 DamageMario(){
 // ignore if already dying or transforming (prevents double hits)
 if(mario.dying || mario.transforming|| mario.invulnTimer > 0)
  return;

 // --- BIG -> SMALL ---
 if(mario.isBig != MARIO_SMALL){
  // reuse transform system (this is correct architecture)
  mario.transforming = 1;
  mario.transformTimer = 30;
  mario.shrinking = 1;
  shrinkSoundActive = TRUE;
  mario.invulnTimer = 120; // 90 = ~1.5 seconds at 60fps
  mario.isBig = MARIO_BIG; // start state
  //transformSeq should already step down if reused correctly

  return;
 }

 // --- SMALL -> DEAD ---
 mario.dying = 1;
 mario.deathTimer = 120;
 dyingSoundActive = TRUE;

 mario.vx = 0;
 mario.vy = -12; // initial jump impulse (tune this)

 // optional: lock direction
}

U0 CheckMushroomPickup()
{
 I64 i;
 for(i = 0; i < MAX_MUSHRM; i++){
  if(!mush[i].active) goto next;

  // skip while emerging (optional but cleaner)
  if(mush[i].rising) goto next;

  if(AABBOverlap(
     mario.x, mario.y, 24, 32,
     mush[i].x, mush[i].y, 32, 32))
  {
   mush[i].active = 0;
   powerUpSoundActive = TRUE;
   // trigger growth
   mario.transforming = 1;
   mario.transformTimer = 30;  // ~0.5 sec feel
   mario.shrinking = 0;

  }

  next:
 }
}


U0 CheckGoombaMario()
{
  I64 i;
  // --- mario bounds ---
  I64 marioLeft       = mario.x;
  I64 marioRight      = mario.x + MarioW();
  I64 marioTop        = mario.y;
  I64 marioBottom     = mario.y + MarioH();
  I64 marioPrevBottom = mario.prevY + MarioH();

  Goomba *stompTarget = NULL;

  for(i = 0; i < MAX_GOOMBAS; i++){
    Goomba *g = &goombas[i];
    if(!g->active || g->crushed)
      goto goon;

    // -------------------------------------------------
    // GOOMBA HITBOXES
    // -------------------------------------------------
    I64 bodyLeft   = g->x + 2;
    I64 bodyRight  = g->x + 30;
    I64 bodyTop    = g->y + 6;
    I64 bodyBottom = g->y + 30;

    // stomp zone: wider horizontally, anchored to bodyTop not sprite top
    I64 stompLeft  = g->x + 4;
    I64 stompRight = g->x + 28;
    I64 stompTop   = bodyTop;     // FIX 1: was g->y, causing stomp zone to float above body

    // -------------------------------------------------
    // BROAD PHASE
    // -------------------------------------------------
    if(marioRight  <= bodyLeft)  goto goon;
    if(marioLeft   >= bodyRight) goto goon;
    if(marioBottom <= bodyTop)   goto goon;
    if(marioTop    >= bodyBottom)goto goon;

    // -------------------------------------------------
    // STOMP OVERLAP WIDTH
    // -------------------------------------------------
    I64 overlapLeft;
    if(marioLeft  > stompLeft)
     overlapLeft = marioLeft;
    else
     overlapLeft= stompLeft;

    I64 overlapRight;
    if(marioRight < stompRight)
     overlapRight = marioRight;
    else
     overlapRight = stompRight;

    I64 overlapWidth = overlapRight - overlapLeft;

    // -------------------------------------------------
    // STOMP TEST
    // -------------------------------------------------

    // FIX 2: treat vy >= 0 as falling - catches the landing frame where vy == 0
    Bool falling = mario.vy >= 0;

    // FIX 3: loosen the crossing window significantly to survive fast falls.
    // We allow marioPrevBottom up to stompTop+12 (was +2) so a fast-moving
    // Mario who crosses multiple pixels per frame still registers.
    // The broad phase already ensures marioBottom >= bodyTop, so we only
    // need to confirm Mario came FROM above.
    Bool crossedTop = (marioPrevBottom <= stompTop + 12) &&
                      (marioBottom     >= stompTop);

    // FIX 4: relax foot contact to 4px (was 6) to match the wider stomp zone
    Bool footContact = overlapWidth >= 4;

    Bool stomp = falling && crossedTop && footContact;

    if(stomp){
      if(!stompTarget || g->y < stompTarget->y)
        stompTarget = g;
      goto goon;
    }

    // -------------------------------------------------
    // BODY HIT - only if we did NOT stomp
    // -------------------------------------------------
    DamageMario();
    return;

    goon:;
  }

  // -------------------------------------------------
  // RESOLVE STOMP
  // -------------------------------------------------
  if(stompTarget){
    stompTarget->crushed    = TRUE;
    stompTarget->animTimer  = 20;
    stompSoundActive        = TRUE;
    mario.y  = stompTarget->y - MarioH();
    mario.vy = -10;
    return;
  }
}

U0 HandleBlockHit(I64 tx, I64 ty)
{
 if(tx < 0 || tx >= clvl->w || ty < 0 || ty >= clvl->h)
  return;

 I64 idx = ty * clvl->w + tx;
 I64 t = clvl->tiles[idx];

 // only handle ? blocks
 if((t==TILE_Q_MUSHRM)
    && clvl->tileBounce[idx] == 0 
    && clvl->tileState[idx] == 0){
  clvl->tileState[idx] = 1; // mark used
  // spawn coin
  clvl->tileBounce[idx] = 0;
  clvl->tileBounceVel[idx] = -4;  // upward impulse   // start upward motion
  SpawnMushroom(tx*32,ty*32-6);
  powerUpAppearSoundActive = TRUE;
 }
 else if((t == TILE_QUESTION) 
    && clvl->tileBounce[idx] == 0 
    && clvl->tileState[idx] == 0){
  clvl->tileState[idx] = 1; // mark used
  // spawn coin
  clvl->tileBounce[idx] = 0;
  clvl->tileBounceVel[idx] = -4;  // upward impulse   // start upward motion
  SpawnCoin(tx * 32, ty * 32);
  coinSoundActive = TRUE;
 }
 // --- BRICK BLOCKS ---
 else if(t == TILE_BRICK &&
         clvl->tileBounce[idx] == 0){

  // small Mario just bounce
  if(!mario.isBig){
    clvl->tileBounce[idx] = 0;
    clvl->tileBounceVel[idx] = -4;
  }
  else{
   // destroy brick
   clvl->tiles[idx] = 0;
   
   // stop any bounce state
   clvl->tileBounce[idx] = 0;
   clvl->tileBounceVel[idx] = 0;
   SpawnBrickParticles(tx,ty);
   brickSoundActive = TRUE;
  }
 }
 I64 hitX = tx * TILE_SIZE;
 I64 hitY = (ty - 1) * TILE_SIZE;

 I64 i;
 for(i = 0; i < MAX_MUSHRM; i++){
  if(!mush[i].active) goto nextMush;
  
  // ignore emerging mushrooms (important)
  if(mush[i].rising) goto nextMush;
  
  if(AABBOverlap(
    mush[i].x, mush[i].y, 32, 32,
    hitX, hitY, TILE_SIZE, TILE_SIZE))
  {
   mush[i].vx = -mush[i].vx;  // reverse direction
   
   // optional: small pop so it feels like impact
   mush[i].vy = -4;
  }
  nextMush:
 }
}

