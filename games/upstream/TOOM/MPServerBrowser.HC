#exe {Cd(__DIR__);};;
#include "MainDrawer.HC";
U0 PrintI(U8 *s,I64 l) {
  DbgPrint("%s:%d\n",s,l);
}
#define GAME_LIST_PORT 7000

class CListClient:CQue {
  I64 socket;
  I64 host_game_at_port;
  I64 connected; //This will close da connection
  U8 host_game_wad[STR_LEN];
  U8 host_game_desc[STR_LEN];
};
U0 SendString(I64 sock,U8 *fmt,...) {
  U32 l;
  fmt=StrPrintJoin(NULL,fmt,argc,argv);
  l=StrLen(fmt);
  send(sock,&l,4,0);
  send(sock,fmt,l,0);
  Free(fmt);
}
U8 *ReceiveString(I64 sock) {
  U32 len;
  I64 h=recv(sock,&len,4,0);
  if(4!=h)
    return NULL;
  U8 *ret=CAlloc(len+1);
  I64 got=recv(sock,ret,len,0);
  if(len!=got) {
    Free(ret);
    return NULL;
  }
  return ret;
}
U0 ServerIncomingTask(CListClient *cl) {
  U32 len;
  I64 host_at,wad_hash;
  U8 *body,*_body,*tmp;
  U8 command[STR_LEN],*ptr,*ptr2;
  CListClient *clients=FramePtr("Clients"),*client;
  while(_body=ReceiveString(cl->socket)) {
    body=_body;
    ptr=command;
    body=StrScan(body,"%s:",&ptr);
    if(!StrCmp(command,"LIST")) {
      for(client=clients->next;client!=clients;client=client->next) {
	if(client->host_game_wad[0]&&client->host_game_at_port) {
	  SendString(cl->socket,"GAME:%s(%s):%d\n",
		client->host_game_wad,
		client->host_game_desc,
		client->host_game_at_port);
        }
      }
      SendString(cl->socket,"DONE:");
    } else if(!StrCmp(command,"HOST")) {
      ptr=&cl->host_game_wad;
      ptr2=&cl->host_game_desc;
      body=StrScan(body,"%s(%s):%d\n",&ptr,&ptr2,&wad_hash);
      tmp=MStrPrint("	RemoveHost(0x%X\n);\n",cl);
      FramePtrAdd("SLIM_PROX_EXIT_CB",tmp);
      SlimProxServerTask(cl->socket,&cl->host_game_at_port);
      Free(_body);
      return;
    }
    Free(_body);
  }
  QueRem(cl);
  close(cl->socket);
  Free(cl);
}
U0 ServerTaskEnd() {
  CListClient *clients=FramePtr("Clients"),*client;
  for(client=clients->next;client!=clients;client=client->next) {
    close(client->socket);
  }
  QueDel(clients);
  Free(clients);
  close(FramePtr("ListenSock"));
  Exit;
}
U0 ServerTask(U8 *at="0.0.0.0") {
  I64 listen_sock=create_server("0.0.0.0",GAME_LIST_PORT,21 /* Savage */ );
  I64 who;
  CListClient *clients=CAlloc(sizeof CQue),*poo;
  QueInit(clients);
  FramePtrAdd("ListenSock",listen_sock);
  FramePtrAdd("Clients",clients);
  Fs->task_end_cb=&ServerTaskEnd;
  while(who=accept(listen_sock,NULL,0)) {
    if(who>0) {
      poo=CAlloc(sizeof CListClient);
      poo->socket=who;
      QueIns(poo,clients);
      Spawn(&ServerIncomingTask,poo,,,Fs);
    }
    Sleep(3);
  }
}
U0 HostGameBrowser(U8 *at="0.0.0.0") {
  CTask *t=Spawn(&ServerTask,at,,,Fs);
  "Press a key to stop serving\n";
  PressAKey;
  Kill(t,FALSE);
}
class CHostGameData {
  U8 game_wad[STR_LEN] format "$$DA-P,A=\"DoomWad:%s\"$$\n";
  U8 game_pwad[STR_LEN] format "$$DA-P,A=\"PWad:%s\"$$\n";
  U8 name[STR_LEN] format "$$DA-P,A=\"Name:%s\"$$\n";
  U8 desc[STR_LEN] format "$$DA-P,A=\"Desciption:%s\"$$\n";
  Bool just_serve format "$$CB,\"Just Serve:\"$$\n";
  I64 wad_hash;
};
U0 RemoveHost(CListClient *cl) {
  QueRem(cl);
  Free(cl);
}
U0 HostGame(I64 sock) {
  CHostGameData data;
  CTask *me;
  U8 *map,*tmp;
  if(!FramePtr("USE_WAD")) {
    PopUpOk("Can't find a Doom WAD to use!!\n");
    throw('Wad');
  }
  StrCpy(&data.game_wad,FramePtr("USE_WAD"));
  StrCpy(&data.name,"Untitled");
  StrCpy(&data.desc,"");
  StrCpy(&data.game_pwad,"");
  data.just_serve=FALSE;
  data.wad_hash=0;
  DocForm(&data,,0,"$$PURPLE$$$$TX+C,\"Host a game of Doom.\"$$$$FD$$\n");
  SendString(sock,"HOST:%s:%s(%s):%d\n",data.game_wad,data.game_pwad,data.name,data.wad_hash);
  if(W_GetLumpPtrFromName("E1M1")) {
    map="E1M1";
  } else if(W_GetLumpPtrFromName("MAP01")) {
    map="MAP01";
  } else {
    PopUpOk("I can't find the first level!!!\n");
     throw('Wad');
  }
  FramePtrAdd("SLIM_PROX",1);
  FramePtrAdd("SLIM_PROX_SOCK",sock);
  if(!data.just_serve) {
    me=User;
    FramePtrAdd("SLIM_PROX",1,me);
    FramePtrAdd("SLIM_PROX_USE_DUMB_SOCK",1,me);
    WinMax(me);
    XTalk(me,"#include \"%Q/MPClient\";;\n",__DIR__);
  }
//See SlimProx.HC
  PrintI(" serce",1);
  ServeGame(map ,4);
  Beep;
  close(sock);
}
U0 DeleteBranch(CDoc *doc,U8 *who) {
  CDocEntry *br,*st,*en;
  if(DocTreeFind(doc,who,&br,&st,&en)) {
    DocCut(doc,br,en);
  }
}
//Returns server port
I64 ServerBrowser(U8 *server="0.0.0.0") {
  F64 next_refresh_tS=0;
  CI64Set *games=I64SetNew;
  CI64Set *old_games=I64SetNew;
  CDoc *doc=DocPut;
  Bool continue=TRUE;
  I64 msg,m1,m2,idx;
  I64 listen_sock=create_connection(server,GAME_LIST_PORT);
  U8 *buf,*_buf;
  U8 wad[STR_LEN],*ptr,*wad_ptr=wad;
  U8 pwad[STR_LEN],*pwad_ptr=pwad;
  U8 desc[STR_LEN],*ptr2,*desc_ptr=desc;
  I64 port,has_action;
  DocClear;
  DocPrint(doc,"$$LTPURPLE$$$$TX+C+H,\"Listing of %Q\"$$$$FD$$\n",server);
  DocPrint(doc,"\n\n$$BT+H+PU,\"Host game\",LM=\"HostGame(%d);\\n\"\n\n$$",listen_sock);
  while(continue) {
    if(next_refresh_tS<tS) {
      next_refresh_tS=tS+1.;
      SendString(listen_sock,"LIST:");
      old_games->cnt=0;
      for(idx=0;idx!=games->cnt;idx++) {
	I64SetAdd(old_games,games->body[idx]);
      }
      games->cnt=0;
      while(buf=ReceiveString(listen_sock)) {
        _buf=buf;
        if(!StrNCmp("GAME:",_buf,5)) {
	  buf+=5;
          ptr=StrNew(buf);
	  for(idx=0;idx!=old_games->cnt;idx++) {
	    if(!StrCmp(ptr,ptr2=old_games->body[idx])) {
	      I64SetRem(old_games,ptr2);
	      Free(ptr2);
	      I64SetAdd(games,ptr);
	      goto skip;
	    }
	  }
	  I64SetAdd(games,ptr);
          StrScan(buf,"%s:%s(%s):%d\n",&wad_ptr,&pwad_ptr,&desc_ptr,&port);
	  if(!*pwad_ptr)
	    ptr=MStrPrint("%Q:%d/%Q",wad,port,desc);
	  else
	    ptr=MStrPrint("%Q(%Q):%d/%Q",wad,pwad,port,desc);

	  if(!DocTreeFind(doc,ptr)) {
            DocTreeWrite(doc,ptr,FALSE,"\n\n$$BT,\"Join Game\",LM=\"PlayNetworkGame(\\\"%Q\\\",%d);\n;\"$$\n\n",server,port);
            DocCollapse(FALSE,doc);
	  }
	  Free(ptr);
skip:
        } else if(!StrNCmp("DONE:",_buf,5)) {
	  for(idx=0;idx!=old_games->cnt;idx++) {
	    ptr=old_games->body[idx];
            StrScan(ptr,"%s:%s(%s):%d\n",&wad_ptr,&pwad_ptr,&desc_ptr,&port);
	    if(!*pwad_ptr)
	      ptr2=MStrPrint("%Q:%d/%Q",wad,port,desc);
	    else
	      ptr2=MStrPrint("%Q(%Q):%d/%Q",wad,pwad,port,desc);
	    DeleteBranch(doc,ptr2);
	    Free(ptr2);
	    Free(ptr);
	  }
	  old_games->cnt=0;
          Free(_buf);
	  break;
        }
        Free(_buf);
      }
    }
    if(MSG_KEY_DOWN==ScanMsg(&m1,&m2)) {
      if(m1==' '||m1=='\n'||m1==CH_ESC) {
        DocEntryRun(doc,doc->cur_entry,FALSE,&has_action);
	if(has_action||m1==CH_ESC) {
	  break;
	}
      }
      DocPutKey(doc,m1,m2);
    }
    Refresh;
  }
  m1=games->cnt;
  while(--m1>=0)
    Free(games->body[m1]);
  I64SetDel(games);
}
#if __CMD_LINE__
ServerBrowser("aiwnios.com");
//ServerBrowser("0.0.0.0");
#endif