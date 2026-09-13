#exe {FramePtrAdd("OLD_DIR",__DIR__);Cd(__DIR__);};
#exe { // useful for dynamic includes, eg CrossNetShims
  Bool a,e;
  Bool _FindDef(U8 *nam,U8 *fmt,...) {
    Bool ret;
    U8 *s=StrPrintJoin(NULL,fmt,argc,argv);
    if (ret=!!HashFind(nam,Fs->hash_table,HTT_DEFINE_STR))
      StreamPrint("%s;;\n",s);
    Free(s);
    return ret;
  }
  a=_FindDef("__AIWNIOS__","\"Running on Aiwnios\\n\";\n");
  e=_FindDef("__EXODUS","\"Running on Exodus\\n\";\n");
  if (!a && !e) {
    StreamPrint("\"Possibly stock TempleOS\\n\";\n");
    StreamPrint("#include \"CrossNetShims/Generic.HC\";;\n");
  } else if(a) {
    StreamPrint("#include \"CrossNetShims/Aiwnios2.HC\";;\n");
  } else if(e) {
    StreamPrint("#include \"CrossNetShims/EXODUS.HC\";;\n");
  }
};;
#exe{
  Cd(FramePtr("OLD_DIR"));
  FramePtrDel("OLD_DIR");
}
I64 ForceSend(I64 sock,U8 *buf,I64 len,U64 ul=0) {
  I64 sent;
  I64 olen=len;
  while(len>0) {
    sent=send(sock,buf,len,ul);
     if(sent<0) {
      return -1;
    }
    buf+=sent;
    len-=sent;
    if(len)
      Yield;
  }
  return olen;
}
I64 ForceRecv(I64 sock,U8 *buf,I64 len,U64 ul=0) {
  I64 got;
  I64 olen=len;
  while(len>0) {
    got=recv(sock,buf,len,ul);
    if(got<0) {
      return -1;
    }
    buf+=got;
    len-=got;
    if(len)
      Yield;
  }
  return olen;
}
CTask *slim_prox_task=Fs;
class CSlimProxSock {
  I64 proxy,lock;
  CSlimProxSock *parent;
  union {
    CFifoU8 *read_fifo;
    CFifoI64 *accept_fifo;
  };
  CFifoU8 *write_fifo;
  CI64Set *children;
  Bool closed;
//is_dumb is for SlimProxDumbCreateConnection()
  Bool is_dumb;
};
#define SLIM_PROX_WRITE 1
#define SLIM_PROX_ACCEPT 2
#define SLIM_PROX_DISCONNECT 3
I64 class CSlimProxHeader {
  U8 ident;
  U8 pad;
  U16 who;
  U32 size;
};
U0 SlimProxTaskRead(CSlimProxSock *root_sock) {
  CSlimProxHeader hdr;
  CSlimProxSock **socks,*who;
  I64 cnt=0,got;
  U8 buf[0x20000],*ptr;
  while(TRUE) {
    got=ForceRecv(root_sock->proxy,&hdr,sizeof(CSlimProxHeader),0);
    if(sizeof(CSlimProxHeader)==got) {
      cnt=hdr.size;
      switch(hdr.ident) {
	case SLIM_PROX_DISCONNECT: {
	  if(hdr.who<root_sock->children->cnt) {
	    who=root_sock->children->body[hdr.who];
	    if(who) {
	      who->closed=TRUE;
	    }
	  }
        }
	break;
	case SLIM_PROX_ACCEPT: {
	  who=CAlloc(sizeof(CSlimProxSock),Fs->parent_task);
	  if(FifoI64Ins(root_sock->accept_fifo,who)) {
            who->parent=root_sock;
	    who->children=I64SetNew();
	    who->write_fifo=FifoU8New(1<<20,Fs->parent_task);
	    who->read_fifo=FifoU8New(1<<20,Fs->parent_task);
	    I64SetAdd(root_sock->children,who);
	  } else {
	    Free(who);
	  }
	}
	break;
        case SLIM_PROX_WRITE: {
	  if(hdr.who<root_sock->children->cnt) {
	    who=root_sock->children->body[hdr.who];
	    if(who)
	     while(cnt>0) {
	      got=ForceRecv(root_sock->proxy,buf,MinI64(cnt,0x20000),0);
	      if(got<=0)
		goto fin;
	      if(got>0) 
	        cnt-=got;
	      ptr=buf;
	      while(--got>=0) {
	        while(!FifoU8Ins(who->read_fifo,*ptr))
		  Sleep(1);
	        ++ptr;
	      } 
	    }
	  }
        }
	break;
	default:
	goto fin;
	break;
      }
    } else
	break;
  }
fin:;
  if(ptr=FramePtr("SLIM_PROX_EXIT_CB")) {
    ExePutS(ptr);
  }
}
U0 SlimProxTaskWrite(CSlimProxSock *root_sock) {
  I64 cnt=0;
  CSlimProxSock **socks;
  U8 buf[0x20000],*ptr;
  CSlimProxHeader hdr;
  while(TRUE) {
again:
    if(root_sock->children) {
      cnt=root_sock->children->cnt;
      socks=root_sock->children->body;
      while(--cnt>=0) {
	if(!socks[cnt]->closed&&!socks[cnt]->is_dumb) {
          ptr=buf;
          while(FifoU8Rem(socks[cnt]->write_fifo,ptr)) {
	    ptr++;
	  }
	  if(ptr!=&buf) {
	    hdr.ident=SLIM_PROX_WRITE;
	    hdr.who=cnt;
	    hdr.size=ToI64(ptr)-ToI64(&buf);
            ForceSend(root_sock->proxy,&hdr,sizeof(CSlimProxHeader),0);
            ForceSend(root_sock->proxy,buf,hdr.size,0);
	  }
	}
      }
    }
    Sleep(1);
  }
}

I64 SlimProxDumbCreateConnection() {
again:;
  CSlimProxSock *root_sock=FramePtr("DUMB_SLIM_PROX_ROOT",adam_task),*who;
  if(!root_sock) {
    Sleep(1); 
    goto again;
  }
  FramePtrAdd("SLIM_PROX",1);
  FramePtrAdd("SLIM_PROX_IS_DUMB",1);
  who=CAlloc(sizeof(CSlimProxSock));
  who->is_dumb=TRUE;
  who->parent=root_sock;
  who->children=I64SetNew();
  who->write_fifo=FifoU8New(1<<20,Fs->parent_task);
  who->read_fifo=FifoU8New(1<<20,Fs->parent_task);
  I64SetAdd(root_sock->children,who);
  FifoI64Ins(root_sock->accept_fifo,who);
  return who;
}



CSlimProxSock *SlimProxCreateConnection(U8 *at,I64 port) {
  if(FramePtr("SLIM_PROX_USE_DUMB_SOCK"))
    return SlimProxDumbCreateConnection;
  if(FramePtr("SLIM_PROX")) {
    "Only servers use slim-proxy,clients connect throug tha main server.\n";
    throw('AssPony');
  }
  return create_connection(at,port);
}
U0 ServerCleanup() {
  FramePtrDel("DUMB_SLIM_PROX_ROOT",adam_task);
  Exit;
}
CSlimProxSock *SlimProxCreateServer(U8 *at,I64 port,I64 bl) {
  if(!FramePtr("SLIM_PROX"))
    return create_server(at,port,bl);
  if(!FramePtr("SLIM_PROX_SOCK")) 
    throw('SlimProx');
  CSlimProxSock *root_sock=CAlloc(sizeof CSlimProxSock);
  root_sock->proxy=FramePtr("SLIM_PROX_SOCK");
  root_sock->children=I64SetNew();
  root_sock->accept_fifo=FifoI64New(0x10,Fs->parent_task);
  root_sock->write_fifo=FifoU8New(0x10,Fs->parent_task);
  Spawn(&SlimProxTaskRead,root_sock,,,Fs);
  Spawn(&SlimProxTaskWrite,root_sock,,,Fs);
  FramePtrAdd("DUMB_SLIM_PROX_ROOT",root_sock,adam_task);
  Fs->task_end_cb=&ServerCleanup;
  return root_sock;
}


#define SLIM_PROX_START_PORT 7001
#define SLIM_PROX_END_PORT 7100
U8 used_ports[SLIM_PROX_END_PORT-SLIM_PROX_START_PORT+1];
MemSet(used_ports,FALSE,SLIM_PROX_END_PORT-SLIM_PROX_START_PORT+1);




U0 SlimProxServerReadTask(I64 sock) {
  I64 who=FramePtr("ToSock");
  I64 new,idx;
  I64 *avail=FramePtr("AvailSocks");
  CArcCompress head,*load;
  CSlimProxHeader hdr;
  for(idx=0;idx!=0x10;idx++) 
    if(avail[idx]==sock)
      break;
  while(sizeof(CArcCompress)==ForceRecv(sock,&head,sizeof(CArcCompress),0)) {
    if(head.compressed_size<1<<20) {
      load=CAlloc(head.compressed_size);
      MemCpy(load,&head,sizeof CArcCompress); 
      if(0>ForceRecv(sock,load+1,head.compressed_size-sizeof(CArcCompress),0)) {
        Free(load);
        break;
      }
    } else
	break;
    hdr.ident=SLIM_PROX_WRITE;
    hdr.size=load->compressed_size;
    hdr.who=idx;
    ForceSend(who,&hdr,sizeof(CSlimProxHeader),0);
    ForceSend(who,load,load->compressed_size,0);
    Free(load);
  }
  hdr.ident=SLIM_PROX_DISCONNECT;
  hdr.size=0;
  hdr.who=idx;
  ForceSend(who,&hdr,sizeof(CSlimProxHeader),0);
  close(sock);
}

U0 SlimProxServerAcceptTask(I64) {
  I64 who=FramePtr("ToSock");
  I64 server=FramePtr("ServerSock");
  I64 new,idx;
  I64 *avail=FramePtr("AvailSocks");
  U8 *tmp;
  CSlimProxHeader hdr;
  while(new=accept(server,NULL,0)) {
    if(new==-1)
      break;
    for(idx=0;idx!=0x10;idx++) {
      if(!avail[idx]) {
        avail[idx]=new;
        hdr.ident=SLIM_PROX_ACCEPT;
	hdr.size=0;
	hdr.who=idx;
        ForceSend(who,&hdr,sizeof(CSlimProxHeader),0);
	Spawn(&SlimProxServerReadTask,new,,,Fs);
	goto next;
      }
    }
//Not enough open holes
    close(new);
next:;
  }
  if(tmp=FramePtr("SLIM_PROX_EXIT_CB")) {
    ExePutS(tmp);
  }
  close(server);
  
}
U0 SlimProxServerTask(I64 sock,I64 *port=NULL) {
//No need to lock as we are 21 Savage runnin' on core 0
  I64 use_port=SLIM_PROX_START_PORT;
  I64 server_sock,cnt;
  I64 avail_socks[0x10];
  CSlimProxHeader hdr;
  U8 buf[0x10000*2],*tmp;
  MemSetI64(avail_socks,NULL,0x10);
  while(use_port<SLIM_PROX_END_PORT) {
    if(!used_ports[use_port])
      break;
    use_port++;
  }
//No availbe ports
  if(use_port==SLIM_PROX_END_PORT) {
fail:;
    close(sock);
    return;
  }
  server_sock=create_server("0.0.0.0",use_port,0x10);
  if(port) *port=use_port;
  FramePtrAdd("ServerSock",server_sock);
  FramePtrAdd("ToSock",sock);
  FramePtrAdd("AvailSocks",avail_socks);
  if(server_sock<=0)
     goto fail;
  Spawn(&SlimProxServerAcceptTask,0,,,Fs);
  while(TRUE) {
    cnt=ForceRecv(sock,&hdr,sizeof(CSlimProxHeader),0);
    if(cnt<0) {
      break;
    }
    if(hdr.ident==SLIM_PROX_WRITE) {
      if(avail_socks[hdr.who]) {
        while(hdr.size>0) {
          cnt=ForceRecv(sock,&buf,MinI64(hdr.size,0x10000*2),0);
	  if(cnt) ForceSend(avail_socks[hdr.who],buf,cnt,0);
	  hdr.size-=cnt;
	}
      }
    } else if(hdr.ident==SLIM_PROX_DISCONNECT) {
      if(cnt=avail_socks[hdr.who])
        close(cnt);
      if(0<=hdr.who<0x10)
        avail_socks[hdr.who]=NULL;
    }
    Sleep(1);
  }
  if(tmp=FramePtr("SLIM_PROX_EXIT_CB")) {
    ExePutS(tmp);
  }
Beep(10);
  close(server_sock);
  close(sock);
}  
U0 SlimProxClose(I64 sock) {
  if(!FramePtr("SLIM_PROX")) {
    close(sock);
  } else {
    CSlimProxSock *sp=sock,*p;
    if(p=sp->parent) {
      I64SetRem(p->children,p);
    }
    sp->closed=TRUE;
  }
}
I64 SlimProxAccept(I64 sock,U8 *who,I64 ul) {
  if(!FramePtr("SLIM_PROX"))
    return accept(sock,who,ul);
  CSlimProxSock *sp=sock,ret;
  if(sp->closed) return -1;
  while(!FifoI64Cnt(sp->accept_fifo)) {
    if(sp->closed) return -1;
    Sleep(1);
  }
  FifoI64Rem(sp->accept_fifo,&ret);
  return ret;
}

I64 SlimProxReceive(I64 sock,U8 *buf,I64 len,I64 ul) {
  if(!FramePtr("SLIM_PROX"))
    return ForceRecv(sock,buf,len,ul);
  I64 ate;
  CSlimProxSock *sp=sock; 
  CFifoU8 *use_fifo;
  if(sp->closed) return -1;
//Swap read/write for "DUMB"
  if(FramePtr("SLIM_PROX_IS_DUMB")) {
    use_fifo=sp->write_fifo;
  } else
    use_fifo=sp->read_fifo;
  while(FifoU8Cnt(use_fifo)<len) {
    if(sp->closed) {
      return -1;
    }
    Sleep(1);
  }
  U8 *o=buf;
  ate=len;
  while(--len>=0)
    FifoU8Rem(use_fifo,buf++);
  return ate;
}
I64 SlimProxSend(I64 sock,U8 *buf,I64 len,I64 ul) {
  I64 sent;
  if(!FramePtr("SLIM_PROX")) {
    ForceSend(sock,buf,len);
    return len;
  }
  I64 ate=len;
  CSlimProxSock *sp=sock; 
  CFifoU8 *use_fifo;
  U8 *o=buf;
  if(sp->closed) return -1;
  while(LBts(&sp->lock,1))
    Yield;
//Swap read/write for "DUMB"
  if(FramePtr("SLIM_PROX_IS_DUMB")) {
    use_fifo=sp->read_fifo;
  } else
    use_fifo=sp->write_fifo;
  while(--len>=0) {
    while(!FifoU8Ins(use_fifo,*buf)) {
      if(sp->closed) {
        LBtr(&sp->lock,1);
        return -1;
      }
      Sleep(1);
    }
    buf++;
  }
  LBtr(&sp->lock,1);
  return ate;
}