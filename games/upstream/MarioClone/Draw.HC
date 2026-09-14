U0 DrawCoins(CDC *dc)
{
 I64 i;
 for(i = 0; i < MAX_COINS; i++){
  if(!coins[i].active) goto nextCoins;
  // simple animation based on timer
  I64 f = (coins[i].timer / 5) % 3;

  CDC* spr;
  if(f == 0) spr = C3;
  else if(f == 1) spr = C2;
  else spr = C5;

  GrBlot3(dc, coins[i].x - camX, coins[i].y, 0, spr);
  nextCoins:
 }
}

U0 DrawMushroom(CDC *dc)
{
 I64 i;
 for(i = 0; i < MAX_MUSHRM; i++){
  if(!mush[i].active) goto next;

  GrBlot3(dc, mush[i].x - camX, mush[i].y, 0, MUSH);

  next:
 }
}
U0 DrawGoombas(CDC *dc)
{
 I64 i;
 for(i = 0; i < MAX_GOOMBAS; i++){
  if(!goombas[i].active) goto skipGoomba;

  CDC* spr;

  if(goombas[i].crushed){
   spr = GOOM3;
  }
  else{
   I64 f = (goombas[i].animTimer++ / 10) % 2;
   if(f==0)
    spr = GOOM1;
   else
    spr = GOOM2;
  }

  GrBlot3(dc, goombas[i].x - camX, goombas[i].y, 0, spr);
  skipGoomba:
 }
 if(!mario.dying)
  CheckGoombaMario();
}

U0 DrawBrickParticles(CDC *dc)
{
 I64 i;
 for(i = 0; i < 32; i++){
  if(!brickParts[i].active) goto next;

  BrickParticle *p = &brickParts[i];

  // phase toggles every ~30 frames
  I64 phase = (globalTimer / 10) % 2;

  CDC* spr;

  if(phase == 0){ // BROK1
    spr= BROK1;
  } else {           // BROK2
    spr=BROK2;
  }

  GrBlot3(dc, p->x - camX, p->y, 0, spr);

  next:
 }
}

CDC* GetMarioSprite()
{
 if(mario.dying){
  return DIE;
 
}
 if(mario.invulnTimer > 0){
  // simple flicker: skip drawing every few frames
  if((mario.invulnTimer / 4) % 2 == 0){
   return NULL; // don't draw this frame
  }
 }

 if(mario.transforming){
  I64 idx = (30 - mario.transformTimer) / 4;
  if(idx > 6) idx = 6;
  
  U8 state = transformSeq[idx];
  if(mario.transforming && mario.isBig == MARIO_MID){
   if(mario.dir == DIR_L)
    return BL8;
   else return BR8;
  }
 }
 mario.animTimer++;

 switch(mario.state){

  case ST_IDLE:
  if(mario.isBig){
   if(mario.dir==DIR_L) return BL1;
   else return BR1;
  }else{
   if(mario.dir==DIR_L) return ONEL;
   else return ONER;
  }
  case ST_WALK:
   if(mario.animTimer > 6){
    mario.frame = (mario.frame + 1) % 3;
    mario.animTimer = 0;
   }
   if(mario.isBig){
    if(mario.dir == DIR_L){
     if(mario.frame==0) return BL3;
     if(mario.frame==1) return BL4;
     return BL5;
    } else {
     if(mario.frame==0) return BR3;
     if(mario.frame==1) return BR4;
     return BR5;
    }
   }else{
    if(mario.dir == DIR_L){
     if(mario.frame==0) return TWOL;
     if(mario.frame==1) return THREEL;
     return FOURL;
    } else {
     if(mario.frame==0) return TWOR;
     if(mario.frame==1) return THREER;
     return FOURR;
    }
   }
  case ST_TURN:
   if(mario.isBig){
    if(mario.turnDir==DIR_L) return BL6;
    else return BR6;
   }else{
    if(mario.turnDir==DIR_L) return FIVEL;
    else return FIVER;
   }
  case ST_JUMP:
  case ST_FALL:
   if(mario.isBig){
    if(mario.dir==DIR_L) return BL7;
    else return BR7;
   }else{
    if(mario.dir==DIR_L) return SIXL;
    else return SIXR;
   }
 }
 return ONER;
}

U0 DrawMarioGame(CTask *task, CDC *dc)
{
 I64 x, y, idx, by;
 I64 startX = camX / TILE_SIZE;
 I64 endX = (camX + SCREEN_W) / TILE_SIZE + 1;

 // --- Background ---
 dc->color = BLUE;
 GrRect(dc,0,0,640,480);
 GrBlot3(dc,0,96,0,SPRITEBG);
 DrawCoins(dc);
 DrawMushroom(dc);
 DrawGoombas(dc);
 // --- Draw level tiles ---
 for(y = 0; y < clvl->h; y++){
  for(x = startX; x < endX; x++){
   switch(clvl->tiles[y * clvl->w + x]){

   case TILE_GROUND: // floor
    GrBlot3(dc, x*32 - camX, y*32, 0, FLOOR1);
    break;

   case TILE_BRICK:
    idx = y * clvl->w + x;
    by = clvl->tileBounce[idx];
    GrBlot3(dc, x*32 - camX, y*32 + by, 0, FLOOR2);
    break;
  
   case TILE_QUESTION: // ? block (coin)
   case TILE_Q_MUSHRM: // ? block (mushroom)
    idx = y * clvl->w + x;
    by = clvl->tileBounce[idx];
    if(clvl->tiles[idx] == 3 || clvl->tiles[idx] == 4){
     if(clvl->tileState[idx] == 0){ // unused block
      // simple global animation timer
      I64 f = (mario.animTimer / 10) % 5;
      CDC* spr;
      if(f == 0) spr = Q1;
      else if(f == 1) spr = Q2;
      else if(f == 2) spr = Q3;
      else if(f == 3) spr = Q2;
      else spr = Q1;
      GrBlot3(dc, x*32 - camX, y*32 +by, 0, spr);
     }
     else{
      // used block
      GrBlot3(dc, x*32 - camX, y*32 +by, 0, Q4);
     }
    }
    break;
   case TILE_PIPE1:
    GrBlot3(dc, x*32 - camX, y*32, 0, PI1);
    break;
   case TILE_PIPE2:    
    GrBlot3(dc, x*32 - camX, y*32, 0, PI2);
    break;
   case TILE_PIPE3:
    GrBlot3(dc, x*32 - camX, y*32, 0, PI3);
    break;
   case TILE_PIPE4:
    GrBlot3(dc, x*32 - camX, y*32, 0, PI4);
    break;
   }
  }
 }
 DrawBrickParticles(dc);
 UpdateBrickParticles();
 UpdateGoombas();
 UpdateTileBounce();
 UpdateCoins();
 UpdateMushroom();  
 UpdateMario();
 CDC* player = GetMarioSprite();
 if(player)
  GrBlot3(dc,mario.x -camX,mario.y,0,player);
}

