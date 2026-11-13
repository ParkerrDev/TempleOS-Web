//test
U0 SendRemoteHeaders(NetClient *c, Actor *remote)
{
 WritePacket(
  c->fd,
  MStrPrint(
   "ASSIGNID\t%d\t%d\t%d",
   remote->id,
   remote->x,
   remote->y
  )
 );
}


U0 SendRemoteSpawn(NetClient *c, Actor *remote)
{
 WritePacket(
  c->fd,
  SerializeActor(remote)
 );
}