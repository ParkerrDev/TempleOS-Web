#define MK_BYTES_NUM 268435456
#define MK_META_NUM 16777216
#define MK_TRACKS_NUM 16

class CMkElem
{
  U8 *start,*data,*end;
  I64 id,size,head;
};

class CMkTrack
{
  I64 num,type,duration,delay;
};

class CMkCluster
{
  CMkCluster *next;
  U8 *data;
  I64 size,time,skip,key_time;
};

U8 *mk_error=NULL,*mk_header=NULL,*mk_tracks=NULL,*mk_cues=NULL,
	*mk_out=NULL;
I64 mk_header_size,mk_tracks_size,mk_cues_size,mk_scan_size,
    mk_scan_head,mk_base,mk_total,mk_info_pos,mk_tracks_pos,mk_cues_pos,
    mk_scale,mk_track_cnt,mk_video,mk_read_start,mk_read_end,
    mk_input_size,mk_begin,mk_end,mk_write_pos,mk_out_size;
F64 mk_duration;
CMkTrack mk_track[MK_TRACKS_NUM];
CMkCluster *mk_first=NULL,*mk_last=NULL;
Bool mk_video_seen;

U0 MkFail(U8 *st)
{
  mk_error=st;
  throw('Mkv');
}

U0 MkExcept()
{
  if (!mk_error) {
    if (Fs->except_ch=='OutMem')
      mk_error="Not enough memory for this clip.";
    else
      mk_error="Could not read this Matroska clip.";
  }
  Fs->catch_except=TRUE;
}

I64 MkVar(U8 **_p,U8 *end,Bool id=FALSE,Bool unknown=FALSE)
{
  U8 *p=*_p;
  I64 i,n=1,mask=0x80,res;
  if (p>=end || !*p) MkFail("Invalid EBML integer.");
  while (!(*p&mask)) {n++;mask>>=1;}
  if (n>8 || id && n>4 || end-p<n)
    MkFail("Truncated EBML integer.");
  res=*p&(mask-1);
  if (id) res=*p;
  for (i=1;i<n;i++) res=res<<8+p[i];
  *_p=p+n;
  if (unknown && res==1<<(7*n)-1) return -1;
  return res;
}

U0 MkElemRead(U8 *p,U8 *end,CMkElem *e,Bool header_only=FALSE)
{
  e->start=p;
  e->id=MkVar(&p,end,TRUE);
  e->size=MkVar(&p,end,FALSE,TRUE);
  e->data=p;e->head=p-e->start;
  if (e->size<0) {
    if (e->id!=0x18538067)
      MkFail("Unknown-size Matroska elements cannot be indexed here.");
    e->end=end;
  } else {
    if (!header_only && e->size>end-p)
      MkFail("Matroska element extends past its parent.");
    e->end=p+e->size;
  }
}

I64 MkUInt(CMkElem *e)
{
  I64 i,res=0;
  if (!(1<=e->size<=8)) MkFail("Invalid Matroska integer size.");
  for (i=0;i<e->size;i++) res=res<<8+e->data[i];
  if (res<0) MkFail("Matroska value exceeds signed 64-bit range.");
  return res;
}

F64 MkFloat(CMkElem *e)
{
  I64 i,bits=0,exp;
  F64 res;
  if (e->size!=4 && e->size!=8) MkFail("Invalid Matroska float size.");
  for (i=0;i<e->size;i++) bits=bits<<8+e->data[i];
  if (e->size==8) res=bits(F64);
  else {
    exp=bits>>23&255;
    if (!exp) res=(bits&0x7FFFFF)*Pow(2.0,-149.0);
    else res=(0x800000+bits&0x7FFFFF)*Pow(2.0,exp-150.0);
    if (bits&0x80000000) res=-res;
  }
  if (!(0<=res<1e18)) MkFail("Invalid Matroska timestamp.");
  return res;
}

Bool MkFind(CMkElem *parent,I64 id,CMkElem *res)
{
  U8 *p=parent->data;
  while (p<parent->end) {
    MkElemRead(p,parent->end,res);
    if (res->id==id) return TRUE;
    p=res->end;
  }
  return FALSE;
}

I64 MkField(CMkElem *parent,I64 id,I64 dft=0)
{
  CMkElem e;
  if (MkFind(parent,id,&e)) return MkUInt(&e);
  return dft;
}

I64 MkScan(U8 *buf,I64 size,I64 pos,I64 total)
{
  CMkElem e;
  mk_error=NULL;
  try {
    if (pos<0 || pos>=total) MkFail("Matroska offset is outside the file.");
    MkElemRead(buf,buf+size,&e,TRUE);
    if (e.size<0) e.size=total-pos-e.head;
    if (e.head>total-pos || e.size>total-pos-e.head)
      MkFail("Matroska element extends past the file.");
    mk_scan_head=e.head;mk_scan_size=e.head+e.size;
    if (e.id==0x18538067) {mk_base=pos+e.head;mk_total=total;}
    return e.id;
  } catch
    MkExcept;
  return -1;
}

I64 MkScanSize()
{
  return mk_scan_size;
}
I64 MkScanHead()
{
  return mk_scan_head;
}

U8 *MkCopy(U8 *p,I64 size)
{
  U8 *res=MAlloc(size);
  if (!res) MkFail("Not enough memory for this clip.");
  MemCpy(res,p,size);
  return res;
}

Bool MkMeta(U8 *buf,I64 size)
{
  CMkElem root,e,a;
  CMkTrack *t;
  U8 *p,*copy;
  I64 id,pos,i;
  try {
    if (size>MK_META_NUM) MkFail("Matroska metadata exceeds 16 MiB.");
    MkElemRead(buf,buf+size,&root);
    if (root.end!=buf+size) MkFail("Invalid Matroska metadata range.");
    if (root.id==0x1A45DFA3) {
      if (!MkFind(&root,0x4282,&e) ||
	  !(e.size==8 && *e.data(U64 *)=='matroska' ||
	  e.size==4 && *e.data(U32 *)=='webm'))
	MkFail("This is not a Matroska or WebM file.");
      if (MkField(&root,0x42F7,1)>1 || MkField(&root,0x4285,1)>4)
	MkFail("This Matroska version is not supported.");
      copy=MkCopy(buf,size);
      Free(mk_header);mk_header=copy;mk_header_size=size;
    } else if (root.id==0x114D9B74) {
      p=root.data;
      while (p<root.end) {
	MkElemRead(p,root.end,&e);p=e.end;
	if (e.id==0x4DBB) {
	  id=MkField(&e,0x53AB);pos=MkField(&e,0x53AC,-1);
	  if (pos<0 || pos>=mk_total-mk_base)
	    MkFail("Matroska seek offset is outside the segment.");
	  pos+=mk_base;
	  if (id==0x1549A966) mk_info_pos=pos;
	  else if (id==0x1654AE6B) mk_tracks_pos=pos;
	  else if (id==0x1C53BB6B) mk_cues_pos=pos;
	}
      }
    } else if (root.id==0x1549A966) {
      mk_scale=MkField(&root,0x2AD7B1,1000000);
      if (!(1<=mk_scale<=1000000000)) MkFail("Invalid Matroska timescale.");
      if (MkFind(&root,0x4489,&e)) mk_duration=MkFloat(&e);
      if (MkFind(&root,0x3CB923,&e) || MkFind(&root,0x3EB923,&e))
	MkFail("Linked Matroska segments cannot be clipped here.");
    } else if (root.id==0x1654AE6B) {
      mk_track_cnt=0;mk_video=0;p=root.data;
      while (p<root.end) {
	MkElemRead(p,root.end,&e);p=e.end;
	if (e.id!=0xAE) goto track_end;
	if (mk_track_cnt==MK_TRACKS_NUM) MkFail("Too many Matroska tracks.");
	t=&mk_track[mk_track_cnt++];
	t->num=MkField(&e,0xD7);t->type=MkField(&e,0x83);
	t->duration=MkField(&e,0x23E383);t->delay=MkField(&e,0x56AA);
	if (!t->num || t->type!=1 && t->type!=2)
	  MkFail("Only Matroska audio and video tracks can be clipped here.");
	if (t->type==1) {
	  if (mk_video)
	    MkFail("Multiple Matroska video tracks are unsupported.");
	  mk_video=t->num;
	}
	for (i=0;i<mk_track_cnt-1;i++)
	  if (mk_track[i].num==t->num)
	    MkFail("Duplicate Matroska track number.");
	if (t->duration>100000000000 || t->delay>10000000000)
	  MkFail("Unreasonable Matroska frame duration or codec delay.");
	if (MkFind(&e,0x6D80,&a) || MkFind(&e,0xE2,&a))
	  MkFail("Encoded or combined Matroska tracks cannot be clipped here.");
	if (MkFind(&e,0x23314F,&a) && MkFloat(&a)!=1.0)
	  MkFail("Scaled Matroska track timestamps are not supported.");
	if (MkFind(&e,0x537F,&a) || MkFind(&e,0x6FAB,&a))
	  MkFail("Offset or overlay Matroska tracks are not supported.");
track_end:
      }
      if (!mk_video) MkFail("No indexed Matroska video track.");
      copy=MkCopy(buf,size);
      Free(mk_tracks);mk_tracks=copy;mk_tracks_size=size;
    } else if (root.id==0x1C53BB6B) {
      copy=MkCopy(buf,size);
      Free(mk_cues);mk_cues=copy;mk_cues_size=size;
    } else MkFail("Unexpected Matroska metadata element.");
    return TRUE;
  } catch {
    MkExcept;
  }
  return FALSE;
}

I64 MkSeekPos(I64 kind)
{
  if (kind==0x1549A966) return mk_info_pos;
  if (kind==0x1654AE6B) return mk_tracks_pos;
  if (kind==0x1C53BB6B) return mk_cues_pos;
  return 0;
}

Bool MkPlan(F64 start,F64 end)
{
  CMkElem root,e,a;
  U8 *p,*q;
  I64 time,pos,prev_time=-1,prev_pos=-1;
  try {
    if (!(0<=start<end) || end-start>600)
      MkFail("Choose a clip between zero and ten minutes long.");
    if (!mk_header || !mk_tracks || !mk_cues || !mk_scale)
      MkFail("Matroska is missing its seek index or tracks.");
    start=start*1000000000/mk_scale;
    end=end*1000000000/mk_scale;
    if (mk_duration && start>=mk_duration)
      MkFail("Clip starts after the video ends.");
    mk_read_start=-1;mk_read_end=mk_total;
    MkElemRead(mk_cues,mk_cues+mk_cues_size,&root);
    p=root.data;
    while (p<root.end) {
      MkElemRead(p,root.end,&e);p=e.end;
      if (e.id!=0xBB) goto cue_end;
      time=MkField(&e,0xB3,-1);q=e.data;
      while (q<e.end) {
	MkElemRead(q,e.end,&a);q=a.end;
	if (a.id!=0xB7 || MkField(&a,0xF7)!=mk_video) goto pos_end;
	pos=MkField(&a,0xF1,-1);
	if (time<0 || time<=prev_time || pos<prev_pos ||
	    pos<0 || pos>=mk_total-mk_base)
	  MkFail("Invalid Matroska cue ordering or offsets.");
	prev_time=time;prev_pos=pos;pos+=mk_base;
	if (time<=start || mk_read_start<0) mk_read_start=pos;
	if (time>end && mk_read_end==mk_total && pos>mk_read_start)
	  mk_read_end=pos;
pos_end:
      }
cue_end:
    }
    if (mk_read_start<0 || mk_read_start>=mk_read_end)
      MkFail("No usable Matroska keyframe index.");
    mk_begin=I64_MAX;mk_end=0;
    return TRUE;
  } catch {
    MkExcept;
  }
  return FALSE;
}

I64 MkReadStart()
{
  return mk_read_start;
}
I64 MkReadEnd()
{
  return mk_read_end;
}

CMkTrack *MkTrack(I64 num)
{
  I64 i;
  for (i=0;i<mk_track_cnt;i++)
    if (mk_track[i].num==num) return &mk_track[i];
  MkFail("Matroska block references an unknown track.");
  return NULL;
}

I64 MkI16(U8 *p)
{
  I64 res=p[0]<<8+p[1];
  if (res&0x8000) res-=0x10000;
  return res;
}

I64 MkLace(U8 *p,U8 *end,I64 flags)
{
  I64 cnt,i,n,size=0,total=0,delta,bits;
  U8 *old;
  if (!flags) return 1;
  if (p>=end) MkFail("Truncated Matroska lace.");
  cnt=*p+1;p++;
  if (cnt<2) MkFail("A Matroska lace needs more than one frame.");
  if (flags==4) {
    if ((end-p)%cnt) MkFail("Unequal fixed Matroska lace sizes.");
  } else {
    for (i=0;i<cnt-1;i++) {
      if (flags==2) {
	size=0;
	do {
	  if (p>=end) MkFail("Truncated Xiph lace size.");
	  n=*p;p++;size+=n;
	} while (n==255);
      } else if (!i) size=MkVar(&p,end);
      else {
	old=p;delta=MkVar(&p,end);bits=7*(p-old)-1;
	size+=delta-(1<<bits-1);
      }
      if (size<0 || size>end-p-total)
	MkFail("Matroska lace exceeds its block.");
      total+=size;
    }
    if (total>end-p) MkFail("Truncated Matroska lace data.");
  }
  return cnt;
}

U0 MkBlock(CMkElem *e,I64 cluster_time,Bool group_key,
	I64 block_duration=0)
{
  U8 *p=e->data;
  I64 num=MkVar(&p,e->end),time,relative,duration,cnt;
  CMkTrack *t=MkTrack(num);
  if (e->end-p<3) MkFail("Truncated Matroska block.");
  relative=MkI16(p);
  time=cluster_time+relative-t->delay/mk_scale;
  if (!mk_video_seen && t->num==mk_video) {
    if (!(e->id==0xA3 && p[2]&0x80 || group_key))
      MkFail("The first indexed video block is not a keyframe.");
    mk_video_seen=TRUE;
  }
  cnt=MkLace(p+3,e->end,p[2]&6);
  duration=t->duration/mk_scale*cnt;
  if (block_duration) duration=block_duration;
  mk_begin=MinI64(mk_begin,time);
  mk_end=MaxI64(mk_end,time+duration);
}

Bool MkBlockKeep(CMkElem *e,CMkCluster *c)
{
  U8 *p=e->data;
  CMkTrack *t=MkTrack(MkVar(&p,e->end));
  if (e->end-p<3) MkFail("Truncated Matroska block.");
  if (!c->skip) return TRUE;
  if (t->type==1) return e->start-c->data>=c->skip;
  return c->time+MkI16(p)>=c->key_time-1000000000/mk_scale;
}

I64 MkFirstKey(CMkElem *root,I64 time,I64 *_key_time)
{
  U8 *p=root->data,*q;
  CMkElem e,b,ref,*tmpb;
  CMkTrack *t;
  Bool key;
  while (p<root->end) {
    MkElemRead(p,root->end,&e);p=e.end;
    if (e.id==0xA3 || e.id==0xA0) {
      key=FALSE;
      if (e.id==0xA3) tmpb=&e;
      else {
	if (!MkFind(&e,0xA1,&b)) MkFail("Matroska block group has no block.");
	key=!MkFind(&e,0xFB,&ref);tmpb=&b;
      }
      q=tmpb->data;t=MkTrack(MkVar(&q,tmpb->end));
      if (tmpb->end-q<3) MkFail("Truncated Matroska block.");
      if (t->num==mk_video && (key || e.id==0xA3 && q[2]&0x80)) {
	*_key_time=time+MkI16(q);
	return e.start-root->start;
      }
    }
  }
  MkFail("The indexed Matroska cluster has no video keyframe.");
  return 0;
}

Bool MkClusterPut(U8 *buf,I64 size)
{
  CMkElem root,e,b,ref;
  CMkCluster *c=NULL,check;
  U8 *p;
  I64 time;
  try {
    if (size>MK_META_NUM || size>MK_BYTES_NUM-mk_input_size)
      MkFail("This Matroska clip exceeds the memory limit.");
    MkElemRead(buf,buf+size,&root);
    if (root.id!=0x1F43B675 || root.end!=buf+size)
      MkFail("Expected an indexed Matroska cluster.");
    time=MkField(&root,0xE7,-1);
    if (time<0 || time>1e15) MkFail("Invalid Matroska cluster timestamp.");
    check.data=buf;check.time=time;check.skip=check.key_time=0;
    if (!mk_first) check.skip=MkFirstKey(&root,time,&check.key_time);
    p=root.data;
    while (p<root.end) {
      MkElemRead(p,root.end,&e);p=e.end;
      if (e.id==0xA3) {
	if (MkBlockKeep(&e,&check)) MkBlock(&e,time,FALSE);
      } else if (e.id==0xA0) {
	if (MkFind(&e,0xA4,&b))
	  MkFail("Changing Matroska codec state is unsupported.");
	if (!MkFind(&e,0xA1,&b)) MkFail("Matroska block group has no block.");
	if (MkBlockKeep(&b,&check))
	  MkBlock(&b,time,!MkFind(&e,0xFB,&ref),MkField(&e,0x9B));
      } else if (e.id==0xAF)
	MkFail("Encrypted Matroska blocks cannot be clipped here.");
    }
    c=CAlloc(sizeof(CMkCluster));
    if (!c) MkFail("Not enough memory for this clip.");
    c->data=MkCopy(buf,size);
    c->size=size;c->time=time;c->skip=check.skip;c->key_time=check.key_time;
    if (mk_last) mk_last->next=c;
    else mk_first=c;
    mk_last=c;mk_input_size+=size;
    return TRUE;
  } catch {
    MkExcept;
    if (c) {Free(c->data);Free(c);}
  }
  return FALSE;
}

U0 MkBytes(U8 *p,I64 size)
{
  if (size<0 || size>MK_BYTES_NUM-mk_write_pos)
    MkFail("Matroska clip exceeds 256 MiB.");
  if (mk_out && p) MemCpy(mk_out+mk_write_pos,p,size);
  mk_write_pos+=size;
}

U0 MkInt(I64 value,I64 size)
{
  I64 i;
  for (i=size-1;i>=0;i--) {
    if (mk_out) mk_out[mk_write_pos]=value>>(i*8);
    mk_write_pos++;
  }
}

U0 MkId(I64 id)
{
  I64 size=1;
  while (id>>(size*8)) size++;
  MkInt(id,size);
}

I64 MkMaster(I64 id)
{
  I64 res;
  MkId(id);res=mk_write_pos;MkInt(0x100000000000000,8);
  return res;
}

U0 MkMasterEnd(I64 pos)
{
  I64 old=mk_write_pos;
  mk_write_pos=pos;MkInt(0x100000000000000+old-pos-8,8);
  mk_write_pos=old;
}

U0 MkValue(I64 id,I64 value,I64 size=8)
{
  MkId(id);MkInt(0x80+size,1);MkInt(value,size);
}

U0 MkBlockWrite(CMkElem *e,I64 shift)
{
  U8 *p=e->data;
  I64 pos,relative;
  MkVar(&p,e->end);
  relative=MkI16(p)+shift;
  if (!(-32768<=relative<=32767))
    MkFail("Matroska block timestamp exceeds the clip range.");
  pos=mk_write_pos;
  MkBytes(e->start,e->end-e->start);
  if (mk_out) {
    mk_out[pos+p-e->start]=relative>>8;
    mk_out[pos+p-e->start+1]=relative;
  }
}

U0 MkWrite()
{
  CMkElem root,e,b;
  CMkCluster *c=mk_first;
  U8 *p,*q;
  I64 segment,info,cluster,group,new_time;
  F64 duration=mk_end-mk_begin;
  mk_write_pos=0;
  MkBytes(mk_header,mk_header_size);
  segment=MkMaster(0x18538067);
  info=MkMaster(0x1549A966);
  MkValue(0x2AD7B1,mk_scale);MkValue(0x4489,duration(I64));
  MkId(0x4D80);MkInt(0x8B,1);MkBytes("HolyC Clips",11);
  MkId(0x5741);MkInt(0x8B,1);MkBytes("HolyC Clips",11);
  MkMasterEnd(info);MkBytes(mk_tracks,mk_tracks_size);
  while (c) {
    MkElemRead(c->data,c->data+c->size,&root);
    cluster=MkMaster(0x1F43B675);new_time=MaxI64(0,c->time-mk_begin);
    MkValue(0xE7,new_time);p=root.data;
    while (p<root.end) {
      MkElemRead(p,root.end,&e);p=e.end;
      if (e.id==0xA3) {
	if (MkBlockKeep(&e,c)) MkBlockWrite(&e,c->time-mk_begin-new_time);
      } else if (e.id==0xA0) {
	if (!MkFind(&e,0xA1,&b)) MkFail("Matroska block group has no block.");
	if (!MkBlockKeep(&b,c)) goto block_end;
	group=MkMaster(0xA0);q=e.data;
	while (q<e.end) {
	  MkElemRead(q,e.end,&b);q=b.end;
	  if (b.id==0xA1) MkBlockWrite(&b,c->time-mk_begin-new_time);
	  else if (b.id!=0xBF) MkBytes(b.start,b.end-b.start);
	}
	MkMasterEnd(group);
      } else if (e.id!=0xE7 && e.id!=0xBF && e.id!=0xA7 && e.id!=0xAB)
	MkBytes(e.start,e.end-e.start);
block_end:
    }
    MkMasterEnd(cluster);c=c->next;
  }
  MkMasterEnd(segment);
}

Bool MkFinish()
{
  Free(mk_out);mk_out=NULL;mk_out_size=0;
  try {
    if (!mk_first || !mk_video_seen)
      MkFail("No video was found in the selected clusters.");
    mk_begin=MaxI64(0,mk_begin);
    if (mk_duration && mk_read_end==mk_total) mk_end=mk_duration;
    if (mk_end<=mk_begin) MkFail("The Matroska clip has no duration.");
    MkWrite;mk_out_size=mk_write_pos;
    mk_out=CAlloc(mk_out_size);
    if (!mk_out) MkFail("Not enough memory for this clip.");
    MkWrite;
    return TRUE;
  } catch {
    MkExcept;
  }
  return FALSE;
}

U8 *MkError()
{
  return mk_error;
}
U8 *MkResult()
{
  return mk_out;
}
I64 MkResultSize()
{
  return mk_out_size;
}
F64 MkStart()
{
  return ToF64(mk_begin)*mk_scale/1000000000;
}
F64 MkEnd()
{
  return ToF64(mk_end)*mk_scale/1000000000;
}

U0 MkReset()
{
  CMkCluster *c=mk_first,*next;
  while (c) {
    next=c->next;Free(c->data);Free(c);c=next;
  }
  Free(mk_header);Free(mk_tracks);Free(mk_cues);Free(mk_out);
  mk_info_pos=mk_tracks_pos=mk_cues_pos=0;
  mk_header=mk_tracks=mk_cues=mk_out=NULL;
  mk_first=mk_last=NULL;mk_input_size=0;mk_video_seen=FALSE;
  mk_scale=mk_track_cnt=mk_video=0;mk_duration=0;
  mk_error=NULL;
}

MkReset;
