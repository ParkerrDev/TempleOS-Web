#pragma once
#include <QFile>
#include <QSaveFile>
#include <array>
#include <stdexcept>
#include <zlib.h>

class InflateFile {
  QFile file;
  z_stream state{};
  std::array<unsigned char,65536> input;
  bool memberEnd=false,complete=false,ready=false;
  void Fill() {
    if(state.avail_in)return;
    qint64 size=file.read(reinterpret_cast<char *>(input.data()),input.size());
    if(size<0)throw std::runtime_error("Cannot read snapshot");
    state.next_in=input.data();state.avail_in=static_cast<unsigned>(size);
  }
public:
  explicit InflateFile(const QString &path):file(path) {
    if(!file.open(QIODevice::ReadOnly))throw std::runtime_error("Cannot open snapshot");
    if(inflateInit2(&state,31)!=Z_OK)throw std::runtime_error("Cannot initialize gzip reader");
    ready=true;
  }
  InflateFile(const InflateFile &)=delete;
  ~InflateFile(){if(ready)inflateEnd(&state);}
  size_t Read(unsigned char *dst,size_t count) {
    if(count>131072)throw std::runtime_error("Snapshot read exceeds transport chunk bound");
    size_t done=0;
    while(done<count&&!complete) {
      Fill();
      if(memberEnd) {
        if(!state.avail_in){complete=true;break;}
        if(inflateReset2(&state,31)!=Z_OK)throw std::runtime_error("Cannot resume gzip member");
        memberEnd=false;
      }
      if(!state.avail_in)throw std::runtime_error("Truncated gzip snapshot");
      state.next_out=dst+done;state.avail_out=static_cast<unsigned>(count-done);
      unsigned before=state.avail_out;
      int result=inflate(&state,Z_NO_FLUSH);
      done+=before-state.avail_out;
      if(result==Z_STREAM_END)memberEnd=true;
      else if(result!=Z_OK)throw std::runtime_error("Corrupt gzip snapshot");
    }
    return done;
  }
};

class DeflateFile {
  QSaveFile file;
  z_stream state{};
  std::array<unsigned char,65536> output;
  bool ready=false,complete=false;
  int Drain(int mode) {
    state.next_out=output.data();state.avail_out=output.size();
    int result=deflate(&state,mode);
    if(result!=Z_OK&&result!=Z_STREAM_END)throw std::runtime_error("Cannot compress snapshot");
    qint64 size=output.size()-state.avail_out;
    if(file.write(reinterpret_cast<const char *>(output.data()),size)!=size)
      throw std::runtime_error("Cannot write snapshot");
    return result;
  }
public:
  explicit DeflateFile(const QString &path):file(path) {
    file.setDirectWriteFallback(false);
    if(!file.open(QIODevice::WriteOnly))throw std::runtime_error("Cannot create snapshot");
    if(deflateInit2(&state,Z_DEFAULT_COMPRESSION,Z_DEFLATED,31,8,Z_DEFAULT_STRATEGY)!=Z_OK)
      throw std::runtime_error("Cannot initialize gzip writer");
    ready=true;
  }
  DeflateFile(const DeflateFile &)=delete;
  ~DeflateFile(){if(ready)deflateEnd(&state);}
  void Write(const unsigned char *src,size_t count) {
    if(complete||count>131072)throw std::runtime_error("Invalid snapshot output chunk");
    state.next_in=const_cast<unsigned char *>(src);state.avail_in=static_cast<unsigned>(count);
    while(state.avail_in)Drain(Z_NO_FLUSH);
  }
  void Commit() {
    if(complete)throw std::runtime_error("Snapshot output already finished");
    while(Drain(Z_FINISH)!=Z_STREAM_END){}
    if(!file.commit())throw std::runtime_error("Cannot atomically replace snapshot");
    complete=true;
  }
};
