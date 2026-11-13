//test
//15 Max dialgoue chat window new

U0 HandlePacket(NetClient *c, U8 *msg)
{
 if(!StrNCmp(msg,"JOIN",4))
 {
  Actor *remote = SpawnRemotePlayer(msg);
  c->actorId = remote->id;
  SendRemoteHeaders(c,remote);
  SendRemoteSpawn(c,GetPlayer());
 }
}

U0 HandleClientPacket(U8 *msg)
{
 PrintDevMessage(MStrPrint("RX=%s",msg));
 if(!StrNCmp(msg,"ASSIGNID",8))
 {
  ValidateJoin(msg);
 }
 if(!StrNCmp(msg,"JOIN",4))
 {
  Actor *remote = SpawnRemotePlayer(msg,TRUE);
 }
}

U0 PollClients()
{
 I64 i,len;
 U8 buf[STR_LEN];
 U8 *line,*ptr;
 NetClient *c;

 for(i=0;i<mc->clientCount;i++)
 {
  c = mc->clients[i];

  if(NetPollForRead(1,&c->fd)!=-1)
  {
   len = NetRead(
    c->fd,
    buf,
    STR_LEN-1
   );

   if(len>0)
   {
    buf[len]=0;

    ptr = buf;

    while(line = ReadALine(&ptr))
    {
     HandlePacket(c,line);
     Free(line);
    }
   }
  }
 }
}
U0 PollServerMessages()
{
 U8 buf[STR_LEN];
 U8 *ptr;
 U8 *line;
 I64 len;
 if(NetPollForRead(1,&mc->serverSocket)!=-1){
  len=NetRead(mc->serverSocket,buf,STR_LEN-1);
  if(len>0) {
   buf[len]=0;
   PrintDevMessage(MStrPrint("RAW:\n%s",buf));
   ptr=buf;
   while(line=ReadALine(&ptr)){
    PrintDevMessage(MStrPrint("LINE: %s",line));
    HandleClientPacket(line);
    Free(line);
   }
  }
 }
}
