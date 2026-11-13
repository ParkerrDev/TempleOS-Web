#define FRAMERULE 3
#define FRAMERULE_CAP 30

//ai scripts
#define AI_DEFAULT	1
#define AI_FISHING	10
#define DIALOG_BOX_Y	375

#define A_STAR_MAX_LEN  10



//StatusEffects

Bool HasStatus(Actor *a, U16 statusCode)
{
 if(a->status1 == statusCode)
 {
  return TRUE;
 }else if(a->status2 == statusCode) {
  return TRUE;
 }
 return FALSE;
}

U0 AddStatus(Actor *a,U16 statusCode){
 switch(a->status1){
  case NRML_STATUS:
   a->status1 = statusCode;
  break;
  case DYNG_STATUS:
  case DEAD_STATUS:
   a->status1 = statusCode;
  break;  
  case WADE_STATUS:
  case ATTK_STATUS:
   a->status1= statusCode;
  break;
 }
}

U0 ScreenToWorldTile(I64 M_X, I64 M_Y, I64 *tx, I64 *ty)
{
 *tx = camera->topLR + ((M_X - camera->cameraOffSetX) / camera->dividX);
 *ty = camera->topUD + ((M_Y - camera->cameraOffSetY) / camera->dividY);
}


U0 IndicatorText(I64 realX, I64 realY, I64 magnitude, U8* currency)
{
  U8* indicator = "+";
  if(magnitude<1)
   indicator = MStrPrint("-%d%s",Abs(magnitude),currency);
  else 
    indicator= MStrPrint("%s%d%s",indicator,magnitude,currency);
  
  I64 i  =0 ;
//  PrintLine(dc,indicator,realX,realY);

}




I64 Heuristic(I64 x1, I64 y1, I64 x2, I64 y2)
{
 // Manhattan distance for 4-dir grid
 return AbsI64(x1 - x2) + AbsI64(y1 - y2);
}

U8 DirFromDelta(I64 dx, I64 dy)
{
 if(dx == -1 && dy ==  0) return DIR_LEFT;
 if(dx ==  1 && dy ==  0) return DIR_RIGHT;
 if(dx ==  0 && dy == -1) return DIR_UP;
 return DIR_DOWN;
}

I64 FindNode(PathNode *nodes, I64 count, I64 x, I64 y)
{
 I64 i;
 for(i = 0; i < count; i++)
  if(nodes[i].x == x && nodes[i].y == y)
   return i;
 return -1;
}

I64 LowestOpenNode(PathNode *nodes, I64 count)
{
 I64 i, best = -1;
 for(i = 0; i < count; i++) {
  if(nodes[i].open && !nodes[i].closed) {
   if(best < 0 || nodes[i].f < nodes[best].f)
    best = i;
  }
 }
 return best;
}

U0 ClearActorPath(Actor *a)
{
 a->pathLen   = 0;
 a->pathIndex = 0;
 a->hasPath   = FALSE;
 //a->pickUpTrigger = FALSE;
}


Bool BuildActorPathFromNodes(Actor *p, PathNode *nodes, I64 goalIndex)
{
 I64 stackX[MAX_PATH_LEN];
 I64 stackY[MAX_PATH_LEN];
 I64 count = 0;
 I64 cur = goalIndex;
 I64 i;

 while(cur >= 0 && count < MAX_PATH_LEN) {
  stackX[count] = nodes[cur].x;
  stackY[count] = nodes[cur].y;
  count++;
  cur = nodes[cur].parentIndex;
 }

 if(count <= 1)
  return FALSE;

 ClearActorPath(p);

 // Reverse from start->goal, converting tiles to dirs
 for(i = count - 1; i > 0; i--) {
  I64 dx = stackX[i - 1] - stackX[i];
  I64 dy = stackY[i - 1] - stackY[i];
  PushActorPathDir(p, DirFromDelta(dx, dy));
 }

 p->pathIndex = 0;
 p->hasPath   = p->pathLen > 0;
 return p->hasPath;
}

Bool CanPathTo(I64 x, I64 y, I64 z)
{
 if(x < 0 || y < 0 || x >= wX || y >= wY)
  return FALSE;

 if(CheckSolid(world->level, x, y, z))
 {
  I64 obj = GetTensorObj(world->level,x,y,z);

  if(obj!=IT_NULL){
   return TRUE;
  }

  return FALSE;
 }

 return TRUE;
}

Bool AStarMoveActorTo(Actor *p, I64 goalX, I64 goalY, I64 z)
{
 PathNode *nodes;
 I64 nodeCount = 0;
 I64 curIdx, nIdx;
 I64 nx, ny;
 Bool ok;

 nodes = MAlloc(ASTAR_MAX_NODES * sizeof(PathNode));
 if(!nodes)
  return FALSE;

 if(goalX == p->x && goalY == p->y) {
  ClearActorPath(p);
  Free(nodes);
  return TRUE;
 }

 if(!CanPathTo(goalX, goalY, z)) {
  Free(nodes);
  return FALSE;
 }

 nodes[0].x = p->x;
 nodes[0].y = p->y;
 nodes[0].g = 0;
 nodes[0].h = Heuristic(p->x, p->y, goalX, goalY);
 nodes[0].f = nodes[0].g + nodes[0].h;
 nodes[0].parentIndex = -1;
 nodes[0].open = TRUE;
 nodes[0].closed = FALSE;
 nodeCount = 1;

 while(TRUE) {
  curIdx = LowestOpenNode(nodes, nodeCount);
  if(curIdx < 0) {
   Free(nodes);
   return FALSE;
  }

  if(nodes[curIdx].x == goalX && nodes[curIdx].y == goalY) {
   ok = BuildActorPathFromNodes(p, nodes, curIdx);
   Free(nodes);
   return ok;
  }

  nodes[curIdx].open = FALSE;
  nodes[curIdx].closed = TRUE;

  nx = nodes[curIdx].x - 1;
  ny = nodes[curIdx].y;
  if(CanPathTo(nx, ny, z)) {
   nIdx = FindNode(nodes, nodeCount, nx, ny);
   if(!(nIdx >= 0 && nodes[nIdx].closed)) {
    if(nIdx < 0) {
     if(nodeCount >= ASTAR_MAX_NODES) {
      Free(nodes);
      return FALSE;
     }
     nIdx = nodeCount++;
     nodes[nIdx].x = nx;
     nodes[nIdx].y = ny;
     nodes[nIdx].g = 0x3FFFFFFFFFFFFFFF;
     nodes[nIdx].h = Heuristic(nx, ny, goalX, goalY);
     nodes[nIdx].f = 0x3FFFFFFFFFFFFFFF;
     nodes[nIdx].parentIndex = -1;
     nodes[nIdx].open = FALSE;
     nodes[nIdx].closed = FALSE;
    }
    if(nodes[curIdx].g + 1 < nodes[nIdx].g) {
      nodes[nIdx].g = nodes[curIdx].g + 1;
      nodes[nIdx].f = nodes[nIdx].g + nodes[nIdx].h;
      nodes[nIdx].parentIndex = curIdx;
      nodes[nIdx].open = TRUE;
    }
   }
  }

  nx = nodes[curIdx].x + 1;
  ny = nodes[curIdx].y;
  if(CanPathTo(nx, ny, z)) {
   nIdx = FindNode(nodes, nodeCount, nx, ny);
   if(!(nIdx >= 0 && nodes[nIdx].closed)) {
    if(nIdx < 0) {
     if(nodeCount >= ASTAR_MAX_NODES) {
      Free(nodes);
      return FALSE;
     }
     nIdx = nodeCount++;
     nodes[nIdx].x = nx;
     nodes[nIdx].y = ny;
     nodes[nIdx].g = 0x3FFFFFFFFFFFFFFF;
     nodes[nIdx].h = Heuristic(nx, ny, goalX, goalY);
     nodes[nIdx].f = 0x3FFFFFFFFFFFFFFF;
     nodes[nIdx].parentIndex = -1;
     nodes[nIdx].open = FALSE;
     nodes[nIdx].closed = FALSE;
    }
    if(nodes[curIdx].g + 1 < nodes[nIdx].g) {
      nodes[nIdx].g = nodes[curIdx].g + 1;
      nodes[nIdx].f = nodes[nIdx].g + nodes[nIdx].h;
      nodes[nIdx].parentIndex = curIdx;
      nodes[nIdx].open = TRUE;
    }
   }
  }

  nx = nodes[curIdx].x;
  ny = nodes[curIdx].y - 1;
  if(CanPathTo(nx, ny, z)) {
   nIdx = FindNode(nodes, nodeCount, nx, ny);
   if(!(nIdx >= 0 && nodes[nIdx].closed)) {
    if(nIdx < 0) {
     if(nodeCount >= ASTAR_MAX_NODES) {
      Free(nodes);
      return FALSE;
     }
     nIdx = nodeCount++;
     nodes[nIdx].x = nx;
     nodes[nIdx].y = ny;
     nodes[nIdx].g = 0x3FFFFFFFFFFFFFFF;
     nodes[nIdx].h = Heuristic(nx, ny, goalX, goalY);
     nodes[nIdx].f = 0x3FFFFFFFFFFFFFFF;
     nodes[nIdx].parentIndex = -1;
     nodes[nIdx].open = FALSE;
     nodes[nIdx].closed = FALSE;
    }
    if(nodes[curIdx].g + 1 < nodes[nIdx].g) {
      nodes[nIdx].g = nodes[curIdx].g + 1;
      nodes[nIdx].f = nodes[nIdx].g + nodes[nIdx].h;
      nodes[nIdx].parentIndex = curIdx;
      nodes[nIdx].open = TRUE;
    }
   }
  }

  nx = nodes[curIdx].x;
  ny = nodes[curIdx].y + 1;
  if(CanPathTo(nx, ny, z)) {
   nIdx = FindNode(nodes, nodeCount, nx, ny);
   if(!(nIdx >= 0 && nodes[nIdx].closed)) {
    if(nIdx < 0) {
     if(nodeCount >= ASTAR_MAX_NODES) {
      Free(nodes);
      return FALSE;
     }
     nIdx = nodeCount++;
     nodes[nIdx].x = nx;
     nodes[nIdx].y = ny;
     nodes[nIdx].g = 0x3FFFFFFFFFFFFFFF;
     nodes[nIdx].h = Heuristic(nx, ny, goalX, goalY);
     nodes[nIdx].f = 0x3FFFFFFFFFFFFFFF;
     nodes[nIdx].parentIndex = -1;
     nodes[nIdx].open = FALSE;
     nodes[nIdx].closed = FALSE;
    }
    if(nodes[curIdx].g + 1 < nodes[nIdx].g) {
      nodes[nIdx].g = nodes[curIdx].g + 1;
      nodes[nIdx].f = nodes[nIdx].g + nodes[nIdx].h;
      nodes[nIdx].parentIndex = curIdx;
      nodes[nIdx].open = TRUE;
    }
   }
  }
 }
}

