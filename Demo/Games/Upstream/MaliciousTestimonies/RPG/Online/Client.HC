//test
U0 ConnectToHost()
{
 CNetAddr *addr;

 mc->serverSocket = NetSocketNew;

 addr = NetAddrNew("127.0.0.1",8000);

 NetConnect(mc->serverSocket,addr);

 PrintDevMessage(MStrPrint("Connected"));
 Sleep(10);

 NetAddrDel(addr);
}

 
U0 ClientTick(){
 if(!mc->clientInitialized)
 {
   ConnectToHost();
   mc->clientInitialized=TRUE;
 }else{
  
  PollServerMessages();
 }
}
