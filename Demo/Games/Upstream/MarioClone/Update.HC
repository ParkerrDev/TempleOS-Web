

U0 UpdateCoins()
{
 I64 i;
 for(i = 0; i < MAX_COINS; i++){
  if(!coins[i].active) goto updateNext;
  coins[i].y += coins[i].vy;
  coins[i].vy += 1;   // gravity

  coins[i].timer--;
  if(coins[i].timer <= 0){
   coins[i].active = 0;
  }
  updateNext:
 }
}

U0 UpdateGoombas()
{
 I64 i;
 for(i = 0; i < MAX_GOOMBAS; i++){
  if(!goombas[i].active) goto next;
  I64 activationX = camX + SCREEN_W + 64;

  // gravity
  goombas[i].vy += GRAVITY;
  if(goombas[i].vy > MAX_FALL)
   goombas[i].vy = MAX_FALL;

  //sleep
  if(!goombas[i].awake){
   if(goombas[i].x <= activationX){
   goombas[i].awake = TRUE;
   }
   else goto next;
  }

  // crushed state
  if(goombas[i].crushed){
   goombas[i].animTimer--;
   if(goombas[i].animTimer <= 0){
    goombas[i].active = 0;
   }
   goto next;
  }


  // horizontal move
  goombas[i].x += goombas[i].vx;

  I64 left   = WorldToTile(goombas[i].x);
  I64 right  = WorldToTile(goombas[i].x + 31);
  I64 top    = WorldToTile(goombas[i].y);
  I64 bottom = WorldToTile(goombas[i].y + 31);

  // wall bounce
  if(goombas[i].vx > 0){
   if(IsSolidTile(right, top) || IsSolidTile(right, bottom)){
    goombas[i].x = right * TILE_SIZE - 32;
    goombas[i].vx = -goombas[i].vx;
   }
  }
  else{
   if(IsSolidTile(left, top) || IsSolidTile(left, bottom)){
    goombas[i].x = (left + 1) * TILE_SIZE;
    goombas[i].vx = -goombas[i].vx;
   }
  }

  // vertical move
  goombas[i].y += goombas[i].vy;

  left   = WorldToTile(goombas[i].x);
  right  = WorldToTile(goombas[i].x + 31);
  top    = WorldToTile(goombas[i].y);
  bottom = WorldToTile(goombas[i].y + 31);

  if(goombas[i].vy > 0){
   if(IsSolidTile(left, bottom) || IsSolidTile(right, bottom)){
    goombas[i].y = bottom * TILE_SIZE - 32;
    goombas[i].vy = 0;
   }
  }
  else if(goombas[i].vy < 0){
   if(IsSolidTile(left, top) || IsSolidTile(right, top)){
    goombas[i].y = (top + 1) * TILE_SIZE;
    goombas[i].vy = 0;
   }
  }

  next:
 }
}

U0 UpdateMushroom()
{
 I64 i;
 for(i = 0; i < MAX_MUSHRM; i++){
  if(!mush[i].active) goto next;

  if(mush[i].rising){
   mush[i].y += mush[i].vy;
   
   if(mush[i].y <= mush[i].targetY){
    mush[i].y = mush[i].targetY;
    
    mush[i].rising = 0;
    mush[i].vx = 2;
    mush[i].vy = 0;
   }
   
   goto next;
  }
  // --- gravity ---
  mush[i].vy += GRAVITY;
  if(mush[i].vy > MAX_FALL)
   mush[i].vy = MAX_FALL;

  // --- horizontal move ---
  mush[i].x += mush[i].vx;

  I64 left   = WorldToTile(mush[i].x);
  I64 right  = WorldToTile(mush[i].x + 31);
  I64 top    = WorldToTile(mush[i].y);
  I64 bottom = WorldToTile(mush[i].y + 31);

  // collide right
  if(mush[i].vx > 0){
   if(IsSolidTile(right, top) || IsSolidTile(right, bottom)){
    mush[i].x = right * TILE_SIZE - 32;
    mush[i].vx = -mush[i].vx; // reverse
   }
  }
  // collide left
  else if(mush[i].vx < 0){
   if(IsSolidTile(left, top) || IsSolidTile(left, bottom)){
    mush[i].x = (left + 1) * TILE_SIZE;
    mush[i].vx = -mush[i].vx; // reverse
   }
  }

  // --- vertical move ---
  mush[i].y += mush[i].vy;

  left   = WorldToTile(mush[i].x);
  right  = WorldToTile(mush[i].x + 31);
  top    = WorldToTile(mush[i].y);
  bottom = WorldToTile(mush[i].y + 31);

  // falling
  if(mush[i].vy > 0){
   if(IsSolidTile(left, bottom) || IsSolidTile(right, bottom)){
    mush[i].y = bottom * TILE_SIZE - 32;
    mush[i].vy = 0;
   }
  }
  // hitting ceiling
  else if(mush[i].vy < 0){
   if(IsSolidTile(left, top) || IsSolidTile(right, top)){
    mush[i].y = (top + 1) * TILE_SIZE;
    mush[i].vy = 0;
   }
  }

  next:
 }
 CheckMushroomPickup(); 

}

U0 UpdateTileBounce(){
I64 i;
 for(i = 0; i < clvl->w * clvl->h; i++){
  if(clvl->tileBounceVel[i] != 0 || clvl->tileBounce[i] != 0){
   clvl->tileBounce[i] += clvl->tileBounceVel[i];
   clvl->tileBounceVel[i] += 1; // gravity
   // clamp when it settles back
   if(clvl->tileBounce[i] > 0){
    clvl->tileBounce[i] = 0;
    clvl->tileBounceVel[i] = 0;
   }
  }
 }
}
Bool CheckTileSpanY(I64 tx, I64 top, I64 bottom)
{
 I64 ty;
 for(ty = top; ty <= bottom; ty++){
  if(IsSolidTile(tx, ty))
   return TRUE;
 }
 return FALSE;
}

Bool CheckTileSpanX(I64 ty, I64 left, I64 right)
{
 I64 tx;
 for(tx = left; tx <= right; tx++){
  if(IsSolidTile(tx, ty))
   return TRUE;
 }
 return FALSE;
}

U0 UpdateMario(){

 globalTimer++;

 mario.prevY = mario.y;

 if(mario.dying){

  mario.deathTimer--;

  // gravity still applies
  mario.vy += GRAVITY;
  if(mario.vy > MAX_FALL)
   mario.vy = MAX_FALL;

  mario.y += mario.vy;
 
  if(mario.deathTimer <= 0){
   RestartLevel(); // todo implement this
  }
 
  return;
 }

 if(mario.invulnTimer > 0){
  mario.invulnTimer--;
 }
 
 if(mario.transforming){
  mario.transformTimer--;
  
  I64 idx = (30 - mario.transformTimer) / 4;
  if(idx > 6) idx = 6;

  if(mario.shrinking){
   idx = 6 - idx; // reverse traversal
  }  
  U8 state = transformSeq[idx]; // 0,1,2
  
  I64 oldH = MarioH();
  
  if(state == 0) mario.isBig = MARIO_SMALL;
  else if(state == 1) mario.isBig = MARIO_BIG;
  else if(state == 2) mario.isBig = MARIO_MID;
  
  I64 newH = MarioH();
  
  if(newH != oldH){
   I64 footY = mario.y + oldH;
   mario.y = footY - newH;
  }
 
  if(mario.transformTimer <= 0){
   mario.transforming = 0;

   if(mario.shrinking)
    mario.isBig = MARIO_SMALL;
   else
    mario.isBig = MARIO_BIG;
  }  
  
  mario.vx = 0;
  mario.vy = 0;
  
  return;
 }
 // --- Horizontal movement ---
 if(keyL){
  if(mario.vx > 0)
   mario.vx -= TURN_ACCEL;
  else
   mario.vx -= ACCEL;

  if(mario.vx < -MAX_SPEED)
   mario.vx = -MAX_SPEED;
 }
 else if(keyR){
  if(mario.vx < 0)
   mario.vx += TURN_ACCEL;
  else
   mario.vx += ACCEL;
  if(mario.vx > MAX_SPEED)
   mario.vx = MAX_SPEED;
 }
 else{
  if(mario.vx > 0){
   mario.vx -= FRICTION;
   if(mario.vx < 0) mario.vx = 0;
  }
  else if(mario.vx < 0){
   mario.vx += FRICTION;
   if(mario.vx > 0) mario.vx = 0;
  }
 }

 // --- Jump buffer ---
 if(keyJump && !jumpHeld){
  jumpBuffer = JUMP_BUFFER_FRAMES;
 }
 jumpHeld = keyJump;

 // --- Gravity ---
 mario.vy += GRAVITY;
 if(mario.vy > MAX_FALL) mario.vy = MAX_FALL;

 // --- variable jump height (early release) ---
 if(!keyJump && mario.vy < 0){
  if(mario.vy < -6)   // only cut if still moving up fast
   mario.vy = -6;
 }
 // --- Apply movement ---
 mario.x += mario.vx;
 // --- world bounds (LEFT WALL) ---
 if(mario.x < camX){
  mario.x = camX;
  mario.vx = 0;
 }

 // --- vertical collision ---
 I64 left   = WorldToTile(mario.x);
 I64 right  = WorldToTile(mario.x + MarioW() -1);
 I64 top    = WorldToTile(mario.y);
 I64 bottom = WorldToTile(mario.y + MarioH() -1);
 // moving right
 if(mario.vx > 0){
  if(CheckTileSpanY(right, top, bottom)){
   mario.x = right * TILE_SIZE - MarioW();
   mario.vx = 0;
  }
 }
 // moving left
 else if(mario.vx < 0){
  if(CheckTileSpanY(left, top, bottom)){
   mario.x = (left + 1) * TILE_SIZE;
   mario.vx = 0;
  }
 }
 mario.y += mario.vy;

 left   = WorldToTile(mario.x);
 right  = WorldToTile(mario.x + MarioW() -1);
 top    = WorldToTile(mario.y -4);
 bottom = WorldToTile(mario.y + MarioH() -1);
 // falling
 if(mario.vy > 0){
  if(IsSolidTile(left, bottom) || IsSolidTile(right, bottom)){
   mario.y = bottom * TILE_SIZE - MarioH();
   mario.vy = 0;
  }
 }
 // jumping
 else if(mario.vy < 0){
  I64 hitY = top;
  I64 hitX1 = left;
  I64 hitX2 = right;
  
  if(IsSolidTile(hitX1, hitY) || IsSolidTile(hitX2, hitY)){
   
   // pick center tile
   I64 midX = WorldToTile(mario.x + 12);
   
   if(IsSolidTile(midX, hitY)){
    HandleBlockHit(midX, hitY);
   }
   else if(IsSolidTile(hitX1, hitY)){
    HandleBlockHit(hitX1, hitY);
   }
   else if(IsSolidTile(hitX2, hitY)){
    HandleBlockHit(hitX2, hitY);
   }
   
   mario.y = (top + 1) * TILE_SIZE;
   mario.vy = 0;
  }
 }  
 

 //recompute AFTER correction
 bottom = WorldToTile(mario.y + MarioH());
 //if( mario.vy >=0){
  grounded =
   IsSolidTile(left,  WorldToTile(mario.y + MarioH())) ||
   IsSolidTile(right, WorldToTile(mario.y + MarioH()));
 //}
 if(jumpBuffer > 0 && grounded){
  mario.vy = JUMP_VEL;
  jumpBuffer = 0;

  jumpSoundActive = 1;
 }

 if(jumpBuffer > 0) jumpBuffer--;

 // --- Direction follows velocity ---
 if(mario.vx < 0) mario.dir = DIR_L;
 if(mario.vx > 0) mario.dir = DIR_R;

 // --- State resolution (ONLY place state is set) ---
 if(!grounded){
  if(mario.vy < 0)
   mario.state = ST_JUMP;
  else
   mario.state = ST_FALL;
 }
 else{
  // trigger turn
  if(mario.turnTimer == 0 &&
   ((keyL && mario.vx > 1) || (keyR && mario.vx < -1))){
 
   mario.turnTimer = TURN_TIME;
   mario.turnDir = mario.dir; // LOCK direction at start of skid
  }  
  // lock turn state while timer active
  if(mario.turnTimer > 0){
   mario.state = ST_TURN;
   mario.turnTimer--;
  }
  else if(mario.vx == 0){
   mario.state = ST_IDLE;
  }
  else{
   mario.state = ST_WALK;
  }
 }
 // follow Mario to the right
 I64 targetCam = camX;
 if(mario.x - camX > SCREEN_W - CAMERA_MARGIN){
  targetCam = mario.x - (SCREEN_W - CAMERA_MARGIN);
 }

 if(targetCam > camX){
  camX= targetCam;
 }

 // clamp camera
 if(camX < 0) camX = 0;

 I64 maxCam = clvl->w * TILE_SIZE - SCREEN_W;
 if(camX > maxCam) camX = maxCam;
}

U0 UpdateBrickParticles()
{
 I64 i;
 for(i = 0; i < 32; i++){
  if(!brickParts[i].active) goto next;

  brickParts[i].x += brickParts[i].vx;

  brickParts[i].vy += GRAVITY;
  if(brickParts[i].vy > MAX_FALL)
   brickParts[i].vy = MAX_FALL;

  brickParts[i].y += brickParts[i].vy;

  brickParts[i].timer--;
  if(brickParts[i].timer <= 0){
   brickParts[i].active = 0;
  }

  next:
 }
}