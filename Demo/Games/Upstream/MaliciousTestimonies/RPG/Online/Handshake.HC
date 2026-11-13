U0 WritePacket(I64 socket,U8 *msg,Bool toFree=TRUE)
{
 U8 *packet;

 packet = MStrPrint("%s\n",msg);

 PrintDevMessage(
  MStrPrint("TX Socket=%d Msg=%s",socket,msg)
 );

 NetWrite(
  socket,
  packet,
  StrLen(packet)
 );

 Free(packet);

 if(toFree)
  Free(msg);
}

U0 ValidateJoin(U8 *msg)
{
 U8 id[16],*idptr=id;
 U8 x[16],*xptr=x;
 U8 y[16],*yptr=y;

 StrScan(
  msg,
  "ASSIGNID\t%s\t%s\t%s",
  &idptr,
  &xptr,
  &yptr
 );

 Actor *p = GetPlayer();

RemoveTensorNPC(
 world->level,
 p->x,
 p->y,
 world->currentZ
);

 p->id = Str2I64(id);
 mc->localPlayerId = p->id;
 p->x  = Str2I64(x);
 p->y  = Str2I64(y);

 UpdateActorCoords(
 p->id,
 p->x,
 p->y
 );
 SetTensorNPC(
  world->level,
  p->id,
  p->x,
  p->y,
  world->currentZ
 );

 PrintDevMessage(
  MStrPrint(
   "Assigned ID=%d X=%d Y=%d",
   p->id,
   p->x,
   p->y
  )
 );
}