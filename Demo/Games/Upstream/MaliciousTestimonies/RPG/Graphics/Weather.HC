#define WEATHER_LAYER_BG 0
#define WEATHER_LAYER_FG 1
#define LEAF_W 16
#define LEAF_H 16
#define WEATHER_NONE           0
#define WEATHER_LEAF_GREEN     1
#define WEATHER_SAND           2
#define WEATHER_ASH            3
#define WEATHER_DUST_INTERIOR  4
#define WEATHER_MIST           5
#define WEATHER_RAIN           6

#define WEATHER_FLAG_NONE      0
#define WEATHER_FLAG_BLOCKED   (1<<0)
#define WEATHER_FLAG_INTERIOR  (1<<1)
#define WEATHER_FLAG_WATER     (1<<2)

#define MAX_WEATHER_PARTICLES 12

static class WeatherParticle {
 Bool active;
 I16 weatherType;
 I16 layer;
 F64 worldX;
 F64 worldY;
 F64 velX;
 F64 velY;
 F64 rot;
 F64 rotVel;
 F64 life;
 F64 maxLife;
 I64 originTileX;
 I64 originTileY;
 I16 spawnAge;
 I16 spawnDuration;
 F64 spawnScale;
 F64 introRot;
 I64 leafColor;
 Bool despawning;
 I16 despawnAge;
 I16 despawnDuration;
 F64 outroRot;
};

WeatherParticle weatherParticles[MAX_WEATHER_PARTICLES];

static class WeatherCell {
 I16 tileColor;
 I16 weatherType;
 I16 flags;
 I16 foliageWeight;
 F64 windResistance;
 F64 speed;
 F64 rotAmp;
 F64 rotFreq;
 F64 swayAmp;
 F64 swayFreq;
 F64 phase;
 Bool active;
 I64 leafColor;
};

WeatherCell *weatherCells = NULL;
I64 weatherW = 0;
I64 weatherH = 0;
I64 weatherZ = -1;
I64 weatherOriginTileX = -1;
I64 weatherOriginTileY = -1;

I64 WeatherWorldToScreenX(F64 worldX){
    return ToI64(worldX)
           - (camera->topLR * camera->dividX)
           + camera->cameraOffSetX;
}

I64 WeatherWorldToScreenY(F64 worldY){
 return ToI64(worldY)
  - (camera->topUD * camera->dividY)
  + camera->cameraOffSetY;
}
U0 DrawScaledLeaf(CDC *dc, U8 *spr, I64 screenX, I64 screenY, F64 rot, F64 scale){
 CDC *tdc;
 tdc = DCAlias(dc, dc->win_task);
 MemCpy(tdc->r, dc->r, sizeof(I64) * 16);
 tdc->flags |= DCF_TRANSFORMATION;
 Mat4x4IdentEqu(tdc->r);
 Mat4x4Scale(tdc->r, scale);
 Mat4x4RotZ(tdc->r, rot);
 Mat4x4TranslationEqu(tdc->r, screenX + LEAF_W / 2,
                              screenY + LEAF_H / 2, 0);
 DCMat4x4Set(tdc, tdc->r);
 Sprite3ZB(tdc, -LEAF_W / 2, -LEAF_H / 2, 0, spr, 0.0);
 DCDel(tdc);
}
U0 RecolorLeaf(CDC *dcLeaf)
{
    dcLeaf->color = LTPURPLE;
    GrFloodFill(dcLeaf, 8, 8, TRUE);
}
U0 DrawScaledLeafColored(CDC *dc, U8 *spr, I64 screenX, I64 screenY,
                         F64 rot, F64 scale, I64 leafColor){
 CDC *tdc;
 CDC *leafCanvas;
 
 leafCanvas = DCNew(640,480);
 DCFill(leafCanvas, TRANSPARENT);
 Sprite3B(leafCanvas, 0, 0, 0, spr);
 
 if (leafColor != GREEN)
     RecolorLeaf(leafCanvas);
 
 tdc = DCAlias(dc, dc->win_task);
 MemCpy(tdc->r, dc->r, sizeof(I64) * 16);
 tdc->flags |= DCF_TRANSFORMATION;
 
 Mat4x4IdentEqu(tdc->r);
 Mat4x4Scale(tdc->r, scale);
 Mat4x4RotZ(tdc->r, rot);
 Mat4x4TranslationEqu(tdc->r, screenX + LEAF_W / 2,
                              screenY + LEAF_H / 2, 0);
 DCMat4x4Set(tdc, tdc->r);
 
 Sprite3ZB(tdc, -LEAF_W / 2, -LEAF_H / 2, 0, leafCanvas, 0.0);
 
 DCDel(tdc);
 DCDel(leafCanvas);
}

Bool IsNearPoppy(I64 tileX, I64 tileY){
 I64 obj;
 
 obj = GetTensorObj(world->level, tileX, tileY, world->currentZ);
 if (obj == OBJ_POPPY)
  return TRUE;
 
 if (tileX > 0) {
  obj = GetTensorObj(world->level, tileX - 1, tileY, world->currentZ);
  if (obj == OBJ_POPPY)
   return TRUE;
 }
 
 if (tileX < wX - 1) {
 obj = GetTensorObj(world->level, tileX + 1, tileY, world->currentZ);
 if (obj == OBJ_POPPY)
  return TRUE;
 }
 
 if (tileY > 0) {
     obj = GetTensorObj(world->level, tileX, tileY - 1, world->currentZ);
     if (obj == OBJ_POPPY)
         return TRUE;
 }
 
 if (tileY < wY - 1) {
     obj = GetTensorObj(world->level, tileX, tileY + 1, world->currentZ);
     if (obj == OBJ_POPPY)
         return TRUE;
 }
 
 return FALSE;
}
U0 DrawScaledWeatherSprite(CDC *dc, U8 *spr, I64 screenX, I64 screenY,
                           F64 rot, F64 scale)
{
    CDC *tdc;

    tdc = DCAlias(dc, dc->win_task);

    MemCpy(tdc->r, dc->r, sizeof(I64) * 16);
    tdc->flags |= DCF_TRANSFORMATION;

    Mat4x4IdentEqu(tdc->r);
    Mat4x4TranslationEqu(tdc->r, screenX, screenY, 0);
    Mat4x4RotZ(tdc->r, rot);
    Mat4x4Scale(tdc->r, scale);
    DCMat4x4Set(tdc, tdc->r);

    Sprite3ZB(tdc, 0, 0, 0, spr, 0.0);

    DCDel(tdc);
}
I64 WeatherIdx(I64 x, I64 y)
{
    return y * weatherW + x;
}
U8 *GetWeatherSprite(I16 weatherType)
{
  if(weatherType==WEATHER_LEAF_GREEN) return GetLeaf;/*
    switch (weatherType) {
        case WEATHER_LEAF_GREEN:    return GetLeaf;
        case WEATHER_SAND:          return GetSandSprite;
        case WEATHER_ASH:           return GetAshSprite;
        case WEATHER_DUST_INTERIOR: return GetDustSprite;
        case WEATHER_MIST:          return GetMistSprite;
        case WEATHER_RAIN:          return GetRainSprite;
    }*/
    return 0;
}
I16 ResolveWeatherTypeFromTile(I16 c)
{
    if (c == BG_GREEN)    return WEATHER_LEAF_GREEN;/*
    if (c == BG_YELLOW)   return WEATHER_SAND;
    if (c == BG_LT_GRAY)  return WEATHER_ASH;
    if (c == BG_RED)      return WEATHER_DUST_INTERIOR;
    if (c == BG_LT_BLUE)  return WEATHER_MIST;
    if (c == BG_BLUE)     return WEATHER_RAIN;*/
    return WEATHER_NONE;
}

U0 ClearWeatherParticles()
{
    I64 n;
    for (n = 0; n < MAX_WEATHER_PARTICLES; n++)
        weatherParticles[n].active = FALSE;
}


I16 GetFoliageWeight(I64 tileX, I64 tileY)
{
    I64 obj;
    I16 weight;

    weight = 1;

    obj = GetTensorObj(world->level, tileX, tileY, world->currentZ);

    if (obj == OBJ_OLIVETREE)
        weight += 6;

    if (tileX > 0) {
        obj = GetTensorObj(world->level, tileX - 1, tileY, world->currentZ);
        if (obj == OBJ_OLIVETREE)
            weight += 2;
    }

    if (tileX < wX - 1) {
        obj = GetTensorObj(world->level, tileX + 1, tileY, world->currentZ);
        if (obj == OBJ_OLIVETREE)
            weight += 2;
    }

    if (tileY > 0) {
        obj = GetTensorObj(world->level, tileX, tileY - 1, world->currentZ);
        if (obj == OBJ_OLIVETREE)
            weight += 2;
    }

    if (tileY < wY - 1) {
        obj = GetTensorObj(world->level, tileX, tileY + 1, world->currentZ);
        if (obj == OBJ_OLIVETREE)
            weight += 2;
    }

    return weight;
}

U0 SetupWeatherCell(WeatherCell *wc, I16 tileColor, I64 x, I64 y){
 wc->tileColor = tileColor;
 wc->weatherType = ResolveWeatherTypeFromTile(tileColor);
 wc->flags = WEATHER_FLAG_NONE;
 wc->active = (wc->weatherType != WEATHER_NONE);
 wc->phase = ToF64((x * 31 + y * 19) & 255) / 255.0;
 
 wc->windResistance = 0.0;
 wc->speed = 0.0;
 wc->rotAmp = 0.0;
 wc->rotFreq = 0.0;
 wc->swayAmp = 0.0;
 wc->swayFreq = 0.0;
 wc->foliageWeight = 0;
 wc->leafColor = GREEN;
 if (tileColor == LTRED)
     wc->flags |= WEATHER_FLAG_INTERIOR;
 if (tileColor == BLUE || tileColor == LTBLUE)
     wc->flags |= WEATHER_FLAG_WATER;
 
 switch (wc->weatherType) {
  case WEATHER_LEAF_GREEN:
      wc->windResistance = 0.4;
      wc->speed = 1.2;
      wc->rotAmp = 10.0;
      wc->rotFreq = 0.1;
      wc->swayAmp = 18.0;
      wc->swayFreq = 0.07;
      wc->foliageWeight = GetFoliageWeight(x, y);
      wc->leafColor = GREEN;
      if (IsNearPoppy(x, y))
          wc->leafColor = LTPURPLE;
      break;
  case WEATHER_SAND:
      wc->windResistance = 0.15;
      wc->speed = 2.5;
      wc->rotAmp = 2.0;
      wc->rotFreq = 0.04;
      wc->swayAmp = 8.0;
      wc->swayFreq = 0.03;
      break;
  case WEATHER_ASH:
      wc->windResistance = 0.55;
      wc->speed = 0.9;
      wc->rotAmp = 5.0;
      wc->rotFreq = 0.05;
      wc->swayAmp = 10.0;
      wc->swayFreq = 0.04;
      break;
  case WEATHER_DUST_INTERIOR:
      wc->windResistance = 0.8;
      wc->speed = 0.3;
      wc->rotAmp = 1.0;
      wc->rotFreq = 0.02;
      wc->swayAmp = 3.0;
      wc->swayFreq = 0.02;
      break;
  case WEATHER_MIST:
      wc->windResistance = 0.9;
      wc->speed = 0.2;
      wc->rotAmp = 0.0;
      wc->rotFreq = 0.0;
      wc->swayAmp = 5.0;
      wc->swayFreq = 0.01;
      break;
  case WEATHER_RAIN:
      wc->windResistance = 0.2;
      wc->speed = 3.2;
      wc->rotAmp = 0.0;
      wc->rotFreq = 0.0;
      wc->swayAmp = 2.0;
      wc->swayFreq = 0.02;
      break;
  default:
      wc->active = FALSE;
      break;
 }
}

WeatherCell *GetWeatherCell(I64 tileX, I64 tileY){
 if (!weatherCells) return NULL;
 if (tileX < 0 || tileY < 0) return NULL;
 if (tileX >= weatherW || tileY >= weatherH) return NULL;
 return &weatherCells[WeatherIdx(tileX, tileY)];
}

I64 CountWeatherParticlesOfType(I16 weatherType)
{
    I64 n;
    I64 count = 0;

    for (n = 0; n < MAX_WEATHER_PARTICLES; n++) {
        if (weatherParticles[n].active &&
            weatherParticles[n].weatherType == weatherType)
            count++;
    }
    return count;
}

I64 CountVisibleWeatherParticles()
{
    I64 n;
    I64 count;
    I64 screenX, screenY;
    WeatherParticle *wp;

    count = 0;

    for (n = 0; n < MAX_WEATHER_PARTICLES; n++) {
        wp = &weatherParticles[n];
        if (!wp->active)
            goto nextloop;

        screenX = ToI64(wp->worldX)
                  - (camera->topLR * camera->dividX)
                  + camera->cameraOffSetX;

        screenY = ToI64(wp->worldY)
                  - (camera->topUD * camera->dividY)
                  + camera->cameraOffSetY;

        if (screenX >= -32 && screenX <= 512 &&
            screenY >= -32 && screenY <= 512)
            count++;

nextloop:
    }

    return count;
}

U0 PruneFarWeatherParticles()
{
    I64 n;
    I64 camTileX, camTileY;
    I64 dx, dy;
    WeatherParticle *wp;

    camTileX = camera->topLR;
    camTileY = camera->topUD;

    for (n = 0; n < MAX_WEATHER_PARTICLES; n++) {
        wp = &weatherParticles[n];
        if (!wp->active)
            goto nextloop;

        dx = wp->originTileX - camTileX;
        if (dx < 0)
            dx = -dx;

        dy = wp->originTileY - camTileY;
        if (dy < 0)
            dy = -dy;

        if (dx > 20 || dy > 20)
            wp->active = FALSE;

nextloop:
    }
}
U0 RefreshWeatherSystem()
{
    PruneFarWeatherParticles();
    weatherOriginTileX = camera->topLR;
    weatherOriginTileY = camera->topUD;
}

Bool ShouldRefreshWeather()
{
    if (CountVisibleWeatherParticles() == 0)
        return TRUE;

    return FALSE;
}
U0 BuildWeatherModel(){
 I64 x, y;

 if(weatherCells)
  Free(weatherCells);

 weatherW = wX;
 weatherH = wY;
 weatherZ = world->currentZ;
 weatherCells = MAlloc(sizeof(WeatherCell) * weatherW * weatherH);

 for(y = 0; y < weatherH; y++) {
  for(x = 0; x < weatherW; x++) {
   I16 c = GetTensor(world->level, x, y, world->currentZ);
   SetupWeatherCell(&weatherCells[WeatherIdx(x, y)], c, x, y);
  }
 }
}

U0 StartLeafDespawn(WeatherParticle *wp)
{
    if (wp->despawning)
        return;

    wp->despawning = TRUE;
    wp->despawnAge = 0;
    wp->despawnDuration = 8;
    wp->outroRot = -6.28318;
}

U0 SpawnWeatherParticleFromCell(WeatherCell *wc, I64 tileX, I64 tileY){
 I64 n;
 I64 r;
 I64 baseWorldX;
 I64 baseWorldY;
 baseWorldX = tileX * camera->dividX;
 baseWorldY = tileY * camera->dividY;
 for (n = 0; n < MAX_WEATHER_PARTICLES; n++) {
  WeatherParticle *wp = &weatherParticles[n];
  if (wp->active)
      goto spawnend;
  wp->active = TRUE;
  wp->weatherType = wc->weatherType;
  wp->originTileX = tileX;
  wp->originTileY = tileY;
  wp->spawnAge = 0;
  wp->spawnDuration = 10;
  wp->spawnScale = 0.1;
  wp->rot = 0.0;
  wp->life = 0.0;
  wp->maxLife = 32.0 + (RandU16 % 48);
  wp->leafColor = wc->leafColor;
  wp->despawning = FALSE;
  wp->despawnAge = 0;
  wp->despawnDuration = 16;
  wp->outroRot = 0.0;
  switch (wc->weatherType) {
   case WEATHER_LEAF_GREEN:
   r = RandI64();
   if (r < 0) r = -r;
   wp->velX = 0.5 + (ToF64(r % 10) * 0.05);   // 1.5 → ~2.0
   
   r = RandI64();
   if (r < 0) r = -r;
   wp->velY = 1.1 + (ToF64(r % 10) * 0.05);   // 2.1 → ~2.6
   /* rotation speed (slight variation above 0.010) */
   r = RandI64();
   if (r < 0) r = -r;
   wp->rotVel = 0.010 + (ToF64(r % 6) * 0.001);   // 0.010 → 0.015
   
   /* spawn duration (slower intro variation) */
   r = RandI64();
   if (r < 0) r = -r;
   wp->spawnDuration = 40 + (r % 16);             // 40 → 55
   
   /* optional: small variation in intro spin */
   r = RandI64();
   if (r < 0) r = -r;
   wp->introRot = (6.28318 * 0.5) + (ToF64(r % 10) * 0.2);
   //  wp->rotVel = 0.010; // 0.003 * 6
   //  wp->spawnDuration = 40;          // shorter intro so it doesn't feel sluggish
   //  wp->introRot = 6.28318 * 0.6;   // still less than a full spin
   wp->spawnScale = 0.2;
   wp->spawnAge = 0;
   if ((RandI64() & 7) != 0)
       wp->layer = WEATHER_LAYER_FG;
   else
       wp->layer = WEATHER_LAYER_BG;
   r = RandI64();
   if (r < 0)
       r = -r;
   wp->worldX = ToF64(baseWorldX + (r % camera->dividX));
   r = RandI64();
   if (r < 0)
       r = -r;
   wp->worldY = ToF64(baseWorldY + (r % camera->dividY));
   break;
    case WEATHER_SAND:
        wp->velX = 1.6;
        wp->velY = 0.2;
        wp->rotVel = 0.03;
        wp->layer = WEATHER_LAYER_BG;
        wp->worldX = ToF64(baseWorldX);
        wp->worldY = ToF64(baseWorldY);
        break;
    case WEATHER_ASH:
        wp->velX = 0.3;
        wp->velY = 0.5;
        wp->rotVel = 0.06;
        wp->layer = WEATHER_LAYER_BG;
        wp->worldX = ToF64(baseWorldX);
        wp->worldY = ToF64(baseWorldY);
        break;
    case WEATHER_DUST_INTERIOR:
        wp->velX = 0.1;
        wp->velY = 0.05;
        wp->rotVel = 0.01;
        wp->layer = WEATHER_LAYER_BG;
        wp->worldX = ToF64(baseWorldX);
        wp->worldY = ToF64(baseWorldY);
        break;
    case WEATHER_MIST:
        wp->velX = 0.2;
        wp->velY = 0.0;
        wp->rotVel = 0.0;
        wp->layer = WEATHER_LAYER_BG;
        wp->worldX = ToF64(baseWorldX);
        wp->worldY = ToF64(baseWorldY);
        break;
    case WEATHER_RAIN:
        wp->velX = 0.1;
        wp->velY = 2.2;
        wp->rotVel = 0.0;
        wp->layer = WEATHER_LAYER_FG;
        wp->worldX = ToF64(baseWorldX);
        wp->worldY = ToF64(baseWorldY);
        break;
    default:
        wp->active = FALSE;
        break;
    }
 return;
spawnend:
    }
}

Bool IsNearLeafBiome(I64 tileX, I64 tileY){
    I64 x, y;
    WeatherCell *wc;

    for (y = tileY - 1; y <= tileY + 1; y++) {
        for (x = tileX - 1; x <= tileX + 1; x++) {
            wc = GetWeatherCell(x, y);
            if (wc && wc->weatherType == WEATHER_LEAF_GREEN &&
                !(wc->flags & WEATHER_FLAG_INTERIOR))
                return TRUE;
        }
    }

    return FALSE;
}
Bool WeatherParticleAllowedOnTile(WeatherParticle *wp, I64 tileX, I64 tileY){
 WeatherCell *wc = GetWeatherCell(tileX, tileY);
 if (!wc)
     return FALSE;
 switch (wp->weatherType) {
     case WEATHER_LEAF_GREEN:
      if (wc->flags & WEATHER_FLAG_INTERIOR)
             return FALSE;
      return IsNearLeafBiome(tileX, tileY);
     case WEATHER_SAND:
         if (wc->flags & WEATHER_FLAG_INTERIOR)
             return FALSE;
         return wc->weatherType == WEATHER_SAND;
     case WEATHER_ASH:
         if (wc->flags & WEATHER_FLAG_INTERIOR)
             return FALSE;
         return wc->weatherType == WEATHER_ASH;
     case WEATHER_DUST_INTERIOR:
         return wc->flags & WEATHER_FLAG_INTERIOR;
     case WEATHER_MIST:
         return wc->weatherType == WEATHER_MIST || (wc->flags & WEATHER_FLAG_WATER);
     case WEATHER_RAIN:
         return !(wc->flags & WEATHER_FLAG_INTERIOR);
     default:
         return FALSE;
 }
}
U0 TrySpawnWeatherParticle(Actor *p,
                          I64 wlb, I64 wub,
                          I64 hlb, I64 hub)
{
 I64 rx, ry;
 I64 tileX, tileY;
 WeatherCell *wc;
 I64 k;
 I64 r;
 
 for (k = 0; k < 16; k++){
     r = RandI64();
     if (r < 0)
         r = -r;
     rx = (r % (wub - wlb)) + wlb;
     
     r = RandI64();
     if (r < 0)
         r = -r;
     ry = (r % (hub - hlb)) + hlb;
     
     tileX = camera->topLR + rx;
     tileY = camera->topUD + ry;
     
     wc = GetWeatherCell(tileX, tileY);
     if (!wc || !wc->active)
      goto nextloop;
     if (wc->flags & WEATHER_FLAG_INTERIOR)
      goto nextloop;
     if (wc->weatherType == WEATHER_LEAF_GREEN) {
         I64 roll;
         I64 chance;
          
         chance = wc->foliageWeight;
         if (chance < 1)
             chance = 1;
         if (chance > 12)
             chance = 12;
         
         roll = RandI64();
         if (roll < 0)
             roll = -roll;
         
         if ((roll % 12) >= chance)
             goto nextloop;
     }
     SpawnWeatherParticleFromCell(wc, tileX, tileY);
     break;
     nextloop:
 }
}

U0 UpdateWeatherParticles(){
  I64 n;
  I64 tileX, tileY;
  F64 moveMul;
  F64 t;
  WeatherParticle *wp;
  for(n = 0; n < MAX_WEATHER_PARTICLES; n++) {
  wp = &weatherParticles[n];
  
  if (!wp->active)
      goto nextloop2;
  moveMul = 1.0;
  
  if (wp->despawning) {
      wp->despawnAge++;
       
      if (wp->despawnAge >= wp->despawnDuration) {
          wp->active = FALSE;
          goto nextloop2;
      }
      
      t = ToF64(wp->despawnAge) / ToF64(wp->despawnDuration);
      F64 t2;
      t2 = t * t;
      wp->spawnScale = 1.0 - t2;
      wp->outroRot = -6.28318 * t2;
     // wp->spawnScale = 1.0 - t;
     // wp->outroRot = -6.28318 * t;
      
      wp->worldX += wp->velX * 0.25;
      wp->worldY += wp->velY * 0.25;
      wp->rot += wp->rotVel;
      
      goto nextloop2;
  }
  
  if (wp->spawnAge < wp->spawnDuration) {
      wp->spawnAge++;
      
      t = ToF64(wp->spawnAge) / ToF64(wp->spawnDuration);
      wp->spawnScale = 0.15 + 0.85 * t;
      wp->introRot = 6.28318 * (1.0 - t);
       
      if (wp->weatherType == WEATHER_LEAF_GREEN)
          moveMul = t;
  }
  else {
      wp->spawnScale = 1.0;
      wp->introRot = 0.0;
  }
  
  wp->worldX += wp->velX * moveMul;
  wp->worldY += wp->velY * moveMul;
  wp->rot += wp->rotVel;
     
  tileX = ToI64(wp->worldX) / camera->dividX;
  tileY = ToI64(wp->worldY) / camera->dividY;
    
  if(tileX < 0 || tileY < 0 || tileX >= weatherW || tileY >= weatherH) {
      if (wp->weatherType == WEATHER_LEAF_GREEN)
          StartLeafDespawn(wp);
      else
          wp->active = FALSE;
      goto nextloop2;
  }
     
  if(!WeatherParticleAllowedOnTile(wp, tileX, tileY)) {
      if (wp->weatherType == WEATHER_LEAF_GREEN)
          StartLeafDespawn(wp);
      else
          wp->active = FALSE;
      goto nextloop2;
  }
  
nextloop2:
 }
}

U0 PlayWeatherLayer(CDC *dc, Actor *p, I16 layer){
 I64 n;
 for (n = 0; n < MAX_WEATHER_PARTICLES; n++) {
  WeatherParticle *wp = &weatherParticles[n];
  U8 *spr;
  I64 screenX, screenY;

  if (!wp->active || wp->layer != layer)
   goto weatherloopend;

  spr = GetWeatherSprite(wp->weatherType);
  if (!spr)
   goto weatherloopend;
  F64 drawX, drawY;
  F64 introT;
  F64 introDriftX, introDriftY;

  drawX = wp->worldX;
  drawY = wp->worldY;

  if (wp->weatherType == WEATHER_LEAF_GREEN &&
    wp->spawnAge < wp->spawnDuration) {

    introT = ToF64(wp->spawnAge) / ToF64(wp->spawnDuration);

    introDriftX = Sin(introT * 6.28318) * 3.0;
    introDriftY = Cos(introT * 6.28318) * 2.0;

    drawX += introDriftX;
    drawY += introDriftY;
  }
  screenX = WeatherWorldToScreenX(drawX);
  screenY = WeatherWorldToScreenY(drawY);
  if (screenX < -32 || screenX > 512 || screenY < -32 || screenY > 512)
   goto weatherloopend;

  if (wp->weatherType == WEATHER_LEAF_GREEN){
   F64 finalRot;

   finalRot = wp->rot + wp->introRot + wp->outroRot;
   if(wp->leafColor==LTPURPLE) 
    spr = GetPinkLeaf;
   DrawScaledLeaf(dc, spr, screenX, screenY, finalRot, wp->spawnScale); 
  }
  else
  {
  // DrawScaledWeatherSprite(dc, spr, screenX, screenY, wp->rot, wp->spawnScale); 
   Sprite3B(dc, screenX, screenY, ToI64(wp->rot), spr);
  }
  weatherloopend:
 }
}


