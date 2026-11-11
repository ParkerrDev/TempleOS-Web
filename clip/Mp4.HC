#define CLIP_TRACKS_NUM 8
#define CLIP_SAMPLES_NUM 2000000
#define CLIP_BYTES_NUM 268435456
#define CLIP_READ_SIZE 16777216

class CClipSample
{
  I64 pos,size,time,duration,offset,out;
  Bool sync,done;
};

class CClipTrack
{
  U8 *box,*tkhd,*mdhd,*hdlr,*minf,*stsd,*dinf,*media;
  I64 scale,sample_cnt,first,last,edit,empty,chunk;
  Bool video;
  CClipSample *samples;
};

U8 *clip_error,*clip_moov,*clip_moov_end,*clip_out;
I64 clip_track_cnt,clip_scale,clip_out_size,clip_write_pos,
	clip_read_pos,clip_read_size,clip_file_size,clip_sample_cnt,
	clip_meta_size,clip_duration;
F64 clip_start,clip_end;
CClipTrack clip_tracks[CLIP_TRACKS_NUM];

U0 ClipFail(U8 *st)
{
  clip_error=st;
  throw('Clip');
}

I64 ClipU32(U8 *p)
{
  return p[0]<<24+p[1]<<16+p[2]<<8+p[3];
}

I64 ClipU64(U8 *p)
{
  I64 res=ClipU32(p)<<32+ClipU32(p+4);
  if (res<0) ClipFail("Media offset exceeds signed 64-bit range.");
  return res;
}

I64 ClipBoxSize(U8 *p,U8 *end)
{
  I64 size;
  if (end-p<8) ClipFail("Truncated MP4 atom.");
  size=ClipU32(p);
  if (size==1) {
    if (end-p<16) ClipFail("Truncated extended MP4 atom.");
    size=ClipU64(p+8);
    if (size<16) ClipFail("Invalid extended MP4 atom.");
  } else if (!size)
    size=end-p;
  if (size<8 || size>end-p) ClipFail("Invalid MP4 atom size.");
  return size;
}

U8 *ClipData(U8 *p)
{
  if (ClipU32(p)==1) return p+16;
  return p+8;
}

Bool ClipCode(U8 *p,U8 *tag)
{
  return *p(U32 *)==*tag(U32 *);
}

Bool ClipTag(U8 *p,U8 *tag)
{
  return ClipCode(p+4,tag);
}

U8 *ClipFind(U8 *p,U8 *end,U8 *tag)
{
  I64 size;
  while (p<end) {
    size=ClipBoxSize(p,end);
    if (ClipTag(p,tag)) return p;
    p+=size;
  }
  return NULL;
}

U8 *ClipChild(U8 *p,U8 *tag,Bool required=TRUE)
{
  U8 *res=NULL;
  if (p)
    res=ClipFind(ClipData(p),p+ClipBoxSize(p,clip_moov_end),tag);
  if (!res && required) ClipFail("Missing required MP4 atom.");
  return res;
}

U8 *ClipPayload(U8 *p,I64 min_size)
{
  U8 *res;
  if (!p) ClipFail("Missing MP4 table.");
  res=ClipData(p);
  if (p+ClipBoxSize(p,clip_moov_end)-res<min_size)
    ClipFail("Truncated MP4 table.");
  return res;
}

I64 ClipTableCnt(U8 *box,I64 stride,I64 prefix=8)
{
  U8 *p=ClipPayload(box,prefix);
  I64 cnt=ClipU32(p+prefix-4);
  if (cnt>(box+ClipBoxSize(box,clip_moov_end)-p-prefix)/stride)
    ClipFail("MP4 table count exceeds its atom.");
  return cnt;
}

U0 ClipTrackRead(CClipTrack *t,U8 *box)
{
  I64 i,j,n,cnt,run,idx,delta,size,chunk_cnt,chunk,pos,desc,
	per_chunk=0,sc_idx=0,sc_cnt,at=0,duration=0,stamp=0;
  U8 *mdia,*stbl,*p,*stsz,*stts,*stsc,*stco,*ctts,*stss,*edts,*elst,
	*stco_data,*sc_data;
  CClipSample *tmps;
  t->box=box;
  t->tkhd=ClipChild(box,"tkhd");
  mdia=ClipChild(box,"mdia");
  t->mdhd=ClipChild(mdia,"mdhd");
  p=ClipPayload(t->mdhd,24);
  if (*p==0)
    t->scale=ClipU32(p+12);
  else if (*p==1) {
    p=ClipPayload(t->mdhd,36);
    t->scale=ClipU32(p+20);
  } else ClipFail("Unknown media-header version.");
  if (!t->scale) ClipFail("Zero media timescale.");
  t->hdlr=ClipChild(mdia,"hdlr");
  p=ClipPayload(t->hdlr,12);
  t->video=ClipCode(p+8,"vide");
  if (!t->video && !ClipCode(p+8,"soun"))
    ClipFail("This MP4 track is not audio or video.");
  t->minf=ClipChild(mdia,"minf");
  t->dinf=ClipChild(t->minf,"dinf");
  p=ClipChild(t->dinf,"dref");
  if (ClipTableCnt(p,12)!=1)
    ClipFail("Multiple data references are not supported.");
  p=ClipPayload(p,20)+8;
  if (ClipBoxSize(p,clip_moov_end)!=12 || !ClipTag(p,"url ") ||
	ClipU32(p+8)!=1)
    ClipFail("The MP4 media is stored in a different file.");
  if (t->video)
    t->media=ClipChild(t->minf,"vmhd");
  else
    t->media=ClipChild(t->minf,"smhd");
  stbl=ClipChild(t->minf,"stbl");
  t->stsd=ClipChild(stbl,"stsd");
  if (ClipTableCnt(t->stsd,8)!=1)
    ClipFail("Multiple MP4 sample descriptions are not supported.");
  p=ClipData(t->stsd)+8;
  ClipBoxSize(p,t->stsd+ClipBoxSize(t->stsd,clip_moov_end));
  if (ClipTag(p,"encv") || ClipTag(p,"enca"))
    ClipFail("Encrypted MP4 tracks cannot be clipped here.");
  stsz=ClipChild(stbl,"stsz");
  p=ClipPayload(stsz,12);
  size=ClipU32(p+4);
  t->sample_cnt=ClipU32(p+8);
  if (!t->sample_cnt || t->sample_cnt>CLIP_SAMPLES_NUM)
    ClipFail("MP4 sample count exceeds the clip limit.");
  if (!size) ClipTableCnt(stsz,4,12);
  clip_sample_cnt+=t->sample_cnt;
  if (clip_sample_cnt>CLIP_SAMPLES_NUM)
    ClipFail("MP4 sample count exceeds the clip limit.");
  t->samples=MAlloc(t->sample_cnt*sizeof(CClipSample));
  if (!t->samples) ClipFail("Not enough memory for MP4 tables.");
  MemSet(t->samples,0,t->sample_cnt*sizeof(CClipSample));
  for (i=0;i<t->sample_cnt;i++) {
    t->samples[i].size=size;
    if (!size) t->samples[i].size=ClipU32(p+12+i*4);
    t->samples[i].sync=TRUE;
  }
  stts=ClipChild(stbl,"stts");
  cnt=ClipTableCnt(stts,8);
  p=ClipData(stts)+8;
  for (i=0;i<cnt;i++,p+=8) {
    run=ClipU32(p);delta=ClipU32(p+4);
    if (!run || !delta || run>t->sample_cnt-at)
      ClipFail("Invalid MP4 time-to-sample table.");
    for (j=0;j<run;j++,at++) {
      t->samples[at].time=stamp;
      t->samples[at].duration=delta;
      stamp+=delta;
    }
  }
  if (at!=t->sample_cnt) ClipFail("Incomplete MP4 time table.");
  ctts=ClipChild(stbl,"ctts",FALSE);
  if (ctts) {
    cnt=ClipTableCnt(ctts,8);
    p=ClipData(ctts);
    n=*p;
    if (n>1) ClipFail("Unknown composition-time version.");
    at=0;
    for (i=0;i<cnt;i++) {
      run=ClipU32(p+8+i*8);delta=ClipU32(p+12+i*8);
      if (n && delta&0x80000000) delta-=0x100000000;
      if (!run || run>t->sample_cnt-at)
	ClipFail("Invalid composition-time table.");
      for (j=0;j<run;j++) t->samples[at++].offset=delta;
    }
    if (at!=t->sample_cnt) ClipFail("Incomplete composition-time table.");
  }
  stss=ClipChild(stbl,"stss",FALSE);
  if (stss) {
    cnt=ClipTableCnt(stss,4);
    for (i=0;i<t->sample_cnt;i++) t->samples[i].sync=FALSE;
    p=ClipData(stss)+8;
    for (i=0;i<cnt;i++) {
      idx=ClipU32(p+i*4)-1;
      if (!(0<=idx<t->sample_cnt)) ClipFail("Invalid MP4 keyframe index.");
      t->samples[idx].sync=TRUE;
    }
  }
  stsc=ClipChild(stbl,"stsc");
  sc_cnt=ClipTableCnt(stsc,12);
  sc_data=ClipData(stsc)+8;
  stco=ClipChild(stbl,"stco",FALSE);
  n=4;
  if (!stco) {stco=ClipChild(stbl,"co64");n=8;}
  chunk_cnt=ClipTableCnt(stco,n);
  stco_data=ClipData(stco)+8;
  at=0;
  for (chunk=1;chunk<=chunk_cnt;chunk++) {
    if (sc_idx<sc_cnt && ClipU32(sc_data+sc_idx*12)==chunk) {
      per_chunk=ClipU32(sc_data+sc_idx*12+4);
      desc=ClipU32(sc_data+sc_idx*12+8);
      if (desc!=1) ClipFail("Invalid MP4 sample description index.");
      sc_idx++;
    }
    if (!per_chunk || per_chunk>t->sample_cnt-at)
      ClipFail("Invalid MP4 sample-to-chunk table.");
    if (n==4) pos=ClipU32(stco_data+(chunk-1)*n);
    else pos=ClipU64(stco_data+(chunk-1)*n);
    for (j=0;j<per_chunk;j++,at++) {
      tmps=&t->samples[at];
      if (pos<0 || tmps->size>clip_file_size-pos)
	ClipFail("MP4 sample points outside the file.");
      tmps->pos=pos;
      pos+=tmps->size;
    }
  }
  if (at!=t->sample_cnt || sc_idx!=sc_cnt)
    ClipFail("Incomplete MP4 chunk table.");
  t->empty=0;t->edit=0;
  edts=ClipChild(box,"edts",FALSE);
  if (edts) {
    elst=ClipChild(edts,"elst");
    p=ClipPayload(elst,8);
    n=12;
    if (*p==1) n=20;
    else if (*p) ClipFail("Unknown edit-list version.");
    cnt=ClipTableCnt(elst,n);
    if (cnt<1 || cnt>2) ClipFail("Complex MP4 edit lists are unsupported.");
    for (i=0;i<cnt;i++) {
      p=ClipData(elst)+8+i*n;
      if (n==12) {
	duration=ClipU32(p);idx=ClipU32(p+4);
	if (idx==0xFFFFFFFF) idx=-1;
      } else {
	duration=ClipU64(p);
	if (ClipU32(p+8)==0xFFFFFFFF && ClipU32(p+12)==0xFFFFFFFF)
	  idx=-1;
	else idx=ClipU64(p+8);
      }
      if (ClipU32(p+n-4)!=0x10000)
	ClipFail("MP4 edits with a changed playback rate are unsupported.");
      if (idx<0 && i==0 && cnt==2) t->empty=duration;
      else if (i==cnt-1 && idx>=0) t->edit=idx;
      else ClipFail("Unsupported MP4 edit sequence.");
    }
  }
}

I64 ClipTicks(F64 seconds,I64 scale)
{
  return ToI64(Round(seconds*scale));
}

U0 ClipSelect(CClipTrack *t)
{
  I64 i,begin=ClipTicks(clip_start,t->scale)+t->edit-
	t->empty*t->scale/clip_scale,
	end=ClipTicks(clip_end,t->scale)+t->edit-
	t->empty*t->scale/clip_scale;
  CClipSample *tmps;
  t->first=-1;t->last=0;
  for (i=0;i<t->sample_cnt;i++) {
    tmps=&t->samples[i];
    if (tmps->time+tmps->offset<=begin && tmps->sync)
      t->first=i;
  }
  if (t->first<0) t->first=0;
  if (!t->video) {
    //Audio decoders retain overlap and filter state across packets.
    i=t->samples[t->first].time-t->scale;
    while (t->first && t->samples[t->first].time>i) t->first--;
  }
  if (!t->samples[t->first].sync)
    ClipFail("No independently decodable keyframe before this clip.");
  for (i=t->first;i<t->sample_cnt;i++) {
    tmps=&t->samples[i];
    if (tmps->time+tmps->offset<end) t->last=i+1;
  }
  if (t->last<=t->first)
    ClipFail("This clip does not overlap a media track.");
}

U0 ClipBytes(U8 *src,I64 size)
{
  if (size<0 || size>CLIP_BYTES_NUM-clip_write_pos)
    ClipFail("Clip exceeds the 256 MiB limit.");
  if (clip_out && src) MemCpy(clip_out+clip_write_pos,src,size);
  clip_write_pos+=size;
}

U0 ClipInt(I64 value,I64 bytes=4)
{
  U8 buf[8];
  I64 i;
  for (i=bytes-1;i>=0;i--) {buf[i]=value&255;value>>=8;}
  ClipBytes(buf,bytes);
}

I64 ClipAtom(U8 *tag)
{
  I64 res=clip_write_pos;
  ClipInt(0);ClipBytes(tag,4);
  return res;
}

U0 ClipAtomEnd(I64 start)
{
  I64 old=clip_write_pos;
  clip_write_pos=start;
  ClipInt(old-start);
  clip_write_pos=old;
}

U0 ClipCopy(U8 *box)
{
  ClipBytes(box,ClipBoxSize(box,clip_moov_end));
}

U0 ClipHeader(U8 *box,I64 offset,I64 duration)
{
  U8 *p=ClipPayload(box,offset+4);
  I64 old=clip_write_pos,version=*p;
  if (version) ClipPayload(box,offset+8);
  else if (duration>0xFFFFFFFF)
    ClipFail("Clip duration exceeds this MP4 header version.");
  ClipCopy(box);
  if (version>1) ClipFail("Unknown MP4 header version.");
  if (clip_out) {
    clip_write_pos=old+p-box+offset;
    if (version) ClipInt(duration,8);
    else ClipInt(duration);
    clip_write_pos=old+ClipBoxSize(box,clip_moov_end);
  }
}

U0 ClipTiming(CClipTrack *t,Bool offsets)
{
  I64 box,i,run,cnt=0,prev=0,value;
  CClipSample *tmps;
  if (offsets) box=ClipAtom("ctts");
  else box=ClipAtom("stts");
  if (offsets) ClipInt(0x1000000);
  else ClipInt(0);
  for (i=t->first;i<t->last;i++) {
    value=t->samples[i].duration;
    if (offsets) value=t->samples[i].offset;
    if (i==t->first || value!=prev) cnt++;
    prev=value;
  }
  ClipInt(cnt);run=0;
  for (i=t->first;i<t->last;i++) {
    tmps=&t->samples[i];value=tmps->duration;
    if (offsets) value=tmps->offset;
    if (run && value!=prev) {ClipInt(run);ClipInt(prev);run=0;}
    run++;prev=value;
  }
  ClipInt(run);ClipInt(prev);
  ClipAtomEnd(box);
}

U0 ClipTrackWrite(CClipTrack *t)
{
  I64 trak,edts,elst,mdia,minf,stbl,box,i,cnt,offset,
	duration=clip_duration,
	begin=t->samples[t->first].time,empty=0,edit;
  U8 *p;
  trak=ClipAtom("trak");
  offset=20;p=ClipPayload(t->tkhd,24);
  if (*p) offset=28;
  ClipHeader(t->tkhd,offset,duration);
  edit=ClipTicks(clip_start,t->scale)+t->edit-
	t->empty*t->scale/clip_scale-begin;
  if (edit<0) {
    empty=-edit*clip_scale/t->scale;
    edit=0;
  }
  if (empty>duration) empty=duration;
  edts=ClipAtom("edts");elst=ClipAtom("elst");
  ClipInt(0x1000000);
  cnt=1;if (empty) cnt=2;
  ClipInt(cnt);
  if (empty) {ClipInt(empty,8);ClipInt(-1,8);ClipInt(0x10000);}
  ClipInt(duration-empty,8);ClipInt(edit,8);ClipInt(0x10000);
  ClipAtomEnd(elst);ClipAtomEnd(edts);
  mdia=ClipAtom("mdia");
  offset=16;p=ClipPayload(t->mdhd,20);
  if (*p) offset=24;
  i=t->last-1;
  ClipHeader(t->mdhd,offset,t->samples[i].time+
	t->samples[i].duration-begin);
  ClipCopy(t->hdlr);
  minf=ClipAtom("minf");ClipCopy(t->media);ClipCopy(t->dinf);
  stbl=ClipAtom("stbl");ClipCopy(t->stsd);
  ClipTiming(t,FALSE);ClipTiming(t,TRUE);
  if (t->video) {
    box=ClipAtom("stss");ClipInt(0);cnt=0;
    for (i=t->first;i<t->last;i++) if (t->samples[i].sync) cnt++;
    ClipInt(cnt);
    for (i=t->first;i<t->last;i++)
      if (t->samples[i].sync) ClipInt(i-t->first+1);
    ClipAtomEnd(box);
  }
  box=ClipAtom("stsc");ClipInt(0);ClipInt(1);
  ClipInt(1);ClipInt(t->last-t->first);ClipInt(1);ClipAtomEnd(box);
  box=ClipAtom("stsz");ClipInt(0);ClipInt(0);
  ClipInt(t->last-t->first);
  for (i=t->first;i<t->last;i++) ClipInt(t->samples[i].size);
  ClipAtomEnd(box);
  box=ClipAtom("stco");ClipInt(0);ClipInt(1);ClipInt(t->chunk);
  ClipAtomEnd(box);ClipAtomEnd(stbl);ClipAtomEnd(minf);
  ClipAtomEnd(mdia);ClipAtomEnd(trak);
}

U0 ClipWrite()
{
  I64 box,moov,mdat,i,j,offset;
  U8 *mvhd,*p;
  CClipTrack *t;
  clip_write_pos=0;
  box=ClipAtom("ftyp");ClipBytes("isom",4);ClipInt(0x200);
  ClipBytes("isomiso2avc1mp41",16);ClipAtomEnd(box);
  moov=ClipAtom("moov");mvhd=ClipChild(clip_moov,"mvhd");
  p=ClipPayload(mvhd,20);offset=16;
  if (*p) offset=24;
  ClipHeader(mvhd,offset,clip_duration);
  for (i=0;i<clip_track_cnt;i++) ClipTrackWrite(&clip_tracks[i]);
  ClipAtomEnd(moov);
  mdat=ClipAtom("mdat");
  for (i=0;i<clip_track_cnt;i++) {
    t=&clip_tracks[i];t->chunk=clip_write_pos;
    for (j=t->first;j<t->last;j++) {
      t->samples[j].out=clip_write_pos;
      ClipBytes(NULL,t->samples[j].size);
    }
  }
  ClipAtomEnd(mdat);
}

U0 ClipDel()
{
  I64 i;
  for (i=0;i<clip_track_cnt;i++) Free(clip_tracks[i].samples);
  Free(clip_out);
  clip_track_cnt=0;clip_out=NULL;
}

Bool ClipPlan(U8 *moov,I64 size,I64 file_size,F64 start,F64 end)
{
  U8 *p,*limit,*mdia,*hdlr;
  I64 n;
  ClipDel;
  clip_error=NULL;clip_sample_cnt=0;
  clip_moov=moov;clip_moov_end=moov+size;
  clip_start=start;clip_end=end;clip_file_size=file_size;
  MemSet(clip_tracks,0,sizeof(clip_tracks));
  try {
    if (!(0<=start<end) || end-start>600 || size>67108864)
      ClipFail("Choose a clip between zero and ten minutes long.");
    if (ClipBoxSize(moov,moov+size)!=size || !ClipTag(moov,"moov"))
      ClipFail("Invalid movie atom.");
    if (ClipChild(moov,"mvex",FALSE))
      ClipFail("Fragmented MP4 clipping is not supported.");
    p=ClipPayload(ClipChild(moov,"mvhd"),24);
    n=12;
    if (*p==1) {p=ClipPayload(ClipChild(moov,"mvhd"),36);n=20;}
    else if (*p) ClipFail("Unknown movie-header version.");
    clip_scale=ClipU32(p+n);
    if (!clip_scale) ClipFail("Zero movie timescale.");
    clip_duration=ClipTicks(clip_end,clip_scale)-
	  ClipTicks(clip_start,clip_scale);
    if (!clip_duration) ClipFail("This clip is too short.");
    limit=moov+size;p=ClipData(moov);
    while (p<limit) {
      n=ClipBoxSize(p,limit);
      if (ClipTag(p,"trak")) {
	mdia=ClipChild(p,"mdia");hdlr=ClipPayload(
	      ClipChild(mdia,"hdlr"),12);
	if (ClipCode(hdlr+8,"vide") || ClipCode(hdlr+8,"soun")) {
	  if (clip_track_cnt==CLIP_TRACKS_NUM)
	    ClipFail("Too many MP4 tracks.");
	  ClipTrackRead(&clip_tracks[clip_track_cnt++],p);
	}
      }
      p+=n;
    }
    if (!clip_track_cnt) ClipFail("No audio or video tracks.");
    for (n=0;n<clip_track_cnt;n++) ClipSelect(&clip_tracks[n]);
    ClipWrite;
    clip_out_size=clip_write_pos;
    clip_out=MAlloc(clip_out_size);
    if (!clip_out) ClipFail("Not enough memory for this clip.");
    MemSet(clip_out,0,clip_out_size);
    ClipWrite;
    return TRUE;
  } catch {
    if (!clip_error) {
      if (Fs->except_ch=='OutMem')
	clip_error="Not enough memory for this clip.";
      else
	clip_error="Could not read this MP4.";
    }
    Fs->catch_except=TRUE;
    ClipDel;
  }
  return FALSE;
}

I64 ClipReadPos()
{
  I64 i,j,pos=clip_file_size,end;
  CClipSample *tmps;
  for (i=0;i<clip_track_cnt;i++)
    for (j=clip_tracks[i].first;j<clip_tracks[i].last;j++) {
      tmps=&clip_tracks[i].samples[j];
      if (!tmps->done && tmps->size && tmps->pos<pos) pos=tmps->pos;
    }
  clip_read_pos=pos;clip_read_size=0;
  if (pos==clip_file_size) return -1;
  end=pos;
  for (i=0;i<clip_track_cnt;i++)
    for (j=clip_tracks[i].first;j<clip_tracks[i].last;j++) {
      tmps=&clip_tracks[i].samples[j];
      if (!tmps->done && tmps->pos<pos+CLIP_READ_SIZE &&
	    tmps->pos+tmps->size>end)
	end=tmps->pos+tmps->size;
    }
  if (end>pos+CLIP_READ_SIZE) end=pos+CLIP_READ_SIZE;
  clip_read_size=end-pos;
  return pos;
}

I64 ClipReadSize()
{
  return clip_read_size;
}

U0 ClipReadPut(U8 *bytes,I64 size)
{
  I64 i,j,start,end;
  CClipSample *tmps;
  if (size!=clip_read_size) ClipFail("Truncated media range.");
  for (i=0;i<clip_track_cnt;i++)
    for (j=clip_tracks[i].first;j<clip_tracks[i].last;j++) {
      tmps=&clip_tracks[i].samples[j];
      start=MaxI64(tmps->pos,clip_read_pos);
      end=MinI64(tmps->pos+tmps->size,clip_read_pos+size);
      if (!tmps->done && start<end) {
	MemCpy(clip_out+tmps->out+start-tmps->pos,
	      bytes+start-clip_read_pos,end-start);
	if (end==tmps->pos+tmps->size) tmps->done=TRUE;
	else {
	  tmps->size-=end-tmps->pos;
	  tmps->out+=end-tmps->pos;
	  tmps->pos=end;
	}
      }
    }
}

U8 *ClipResult()
{
  return clip_out;
}

I64 ClipResultSize()
{
  return clip_out_size;
}

U8 *ClipError()
{
  return clip_error;
}

I64 ClipScan(U8 *buf,I64 size,I64 total,I64 pos)
{//Returns the next atom's offset, or -1 at moov and -2 on error.
  I64 n;
  clip_error=NULL;
  try {
    if (size<8 || pos<0 || pos>total-8)
      ClipFail("Truncated MP4 header.");
    n=ClipU32(buf);
    if (n==1) {
      if (size<16) ClipFail("Truncated extended MP4 header.");
      n=ClipU64(buf+8);
      if (n<16) ClipFail("Invalid extended MP4 header.");
    } else if (!n) n=total-pos;
    if (n<8 || n>total-pos) ClipFail("MP4 atom extends past the file.");
    if (ClipTag(buf,"moov")) {
      if (n>67108864) ClipFail("MP4 metadata exceeds the 64 MiB limit.");
      clip_meta_size=n;
      return -1;
    }
    return pos+n;
  } catch
    Fs->catch_except=TRUE;
  return -2;
}

I64 ClipMetaSize()
{
  return clip_meta_size;
}

clip_out=NULL;clip_track_cnt=0;
