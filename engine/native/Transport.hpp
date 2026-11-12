#pragma once
#include "Streams.hpp"
#include "Js.hpp"
#include <QImage>
#include <atomic>
#include <QCryptographicHash>
#include <QStringDecoder>
#include <map>
#include <memory>
#include <functional>
#include <cmath>
#include <climits>

struct TransportState {
  int next=1;
  std::atomic<bool> *cancel=nullptr;
  QImage image;
  std::function<void(const char *,size_t)> progress;
  size_t readBytes=0,writeBytes=0;
  std::map<int,std::unique_ptr<InflateFile>> readers;
  std::map<int,std::unique_ptr<DeflateFile>> writers;
};
static TransportState &Transport(JSContextRef ctx) {
  auto *state=static_cast<TransportState *>(JSObjectGetPrivate(JSContextGetGlobalObject(ctx)));
  if(!state)throw std::runtime_error("Native transport is detached");
  return *state;
}

static JSValueRef TransportCall(JSContextRef ctx,JSValueRef *error,const std::function<JSValueRef()> &fn) {
  try {if(Transport(ctx).cancel && Transport(ctx).cancel->load())throw std::runtime_error("Operation cancelled");return fn();}catch(const std::exception &e){Error(ctx,error,e.what());return JSValueMakeUndefined(ctx);}
}
static int Integer(JSContextRef ctx,JSValueRef value,int maximum,JSValueRef *error) {
  double x=JSValueToNumber(ctx,value,error);
  if(*error||!std::isfinite(x)||x<0||x>maximum||x!=static_cast<int>(x))throw std::runtime_error("Invalid transport integer");
  return static_cast<int>(x);
}
static QByteArray ByteCopy(JSContextRef ctx,JSValueRef value,JSValueRef *error,size_t maximum) {
  if(JSValueGetTypedArrayType(ctx,value,error)!=kJSTypedArrayTypeUint8Array||*error)
    throw std::runtime_error("Transport expects a Uint8Array");
  JSObjectRef object=JSValueToObject(ctx,value,error);
  size_t size=JSObjectGetTypedArrayByteLength(ctx,object,error),offset=JSObjectGetTypedArrayByteOffset(ctx,object,error);
  JSObjectRef buffer=JSObjectGetTypedArrayBuffer(ctx,object,error);
  size_t length=JSObjectGetArrayBufferByteLength(ctx,buffer,error);
  if(*error||size>maximum||offset>length||size>length-offset)throw std::runtime_error("Transport byte range");
  if(!size)return {};
  const char *ptr=static_cast<const char *>(JSObjectGetArrayBufferBytesPtr(ctx,buffer,error));
  if(*error)throw std::runtime_error("Transport requires an ordinary copied buffer");
  return QByteArray(ptr+offset,size);
}
static JSValueRef ByteValue(JSContextRef ctx,const unsigned char *src,size_t size,JSValueRef *error) {
  void *dst=malloc(std::max(size_t(1),size));if(!dst)throw std::bad_alloc();
  if(size)memcpy(dst,src,size);
  return JSObjectMakeTypedArrayWithBytesNoCopy(ctx,kJSTypedArrayTypeUint8Array,dst,size,FreeBytes,nullptr,error);
}
static JSValueRef StreamOpen(JSContextRef ctx,JSObjectRef,JSObjectRef,size_t n,const JSValueRef *args,JSValueRef *error) {
  return TransportCall(ctx,error,[&](){
    if(n!=2)throw std::runtime_error("StreamOpen expects path and mode");
    QString path=QString::fromStdString(String(ctx,args[0]));int mode=Integer(ctx,args[1],1,error);
    auto &state=Transport(ctx);
    if(state.next==INT_MAX||state.readers.size()+state.writers.size()>=64)throw std::runtime_error("Too many snapshot streams");
    int id=state.next++;
    if(mode)state.writers.emplace(id,std::make_unique<DeflateFile>(path));
    else state.readers.emplace(id,std::make_unique<InflateFile>(path));
    return JSValueMakeNumber(ctx,id);
  });
}
static JSValueRef StreamReadInto(JSContextRef ctx,JSObjectRef,JSObjectRef,size_t n,const JSValueRef *args,JSValueRef *error) {
  return TransportCall(ctx,error,[&](){
    if(n!=2)throw std::runtime_error("StreamReadInto expects handle and destination");
    int id=Integer(ctx,args[0],INT_MAX,error);
    if(JSValueGetTypedArrayType(ctx,args[1],error)!=kJSTypedArrayTypeUint8Array||*error)throw std::runtime_error("Transport expects a Uint8Array");
    auto object=JSValueToObject(ctx,args[1],error);
    auto count=JSObjectGetTypedArrayByteLength(ctx,object,error),offset=JSObjectGetTypedArrayByteOffset(ctx,object,error);
    auto buffer=JSObjectGetTypedArrayBuffer(ctx,object,error);auto length=JSObjectGetArrayBufferByteLength(ctx,buffer,error);
    if(*error||count>131072||offset>length||count>length-offset)throw std::runtime_error("Transport byte range");
    auto &state=Transport(ctx);auto &reader=state.readers.at(id);
    if(!count)return JSValueMakeNumber(ctx,0);
    auto bytes=static_cast<unsigned char *>(JSObjectGetArrayBufferBytesPtr(ctx,buffer,error));
    if(*error)throw std::runtime_error("Transport requires an ordinary buffer");
    size_t got=reader->Read(bytes+offset,count);
    state.readBytes+=got;if(state.progress)state.progress("read",state.readBytes);
    if(state.cancel&&state.cancel->load())throw std::runtime_error("Operation cancelled");
    return JSValueMakeNumber(ctx,got);
  });
}
static JSValueRef StreamWrite(JSContextRef ctx,JSObjectRef,JSObjectRef,size_t n,const JSValueRef *args,JSValueRef *error) {
  return TransportCall(ctx,error,[&](){
    if(n!=2)throw std::runtime_error("StreamWrite expects handle and bytes");
    int id=Integer(ctx,args[0],INT_MAX,error);QByteArray bytes=ByteCopy(ctx,args[1],error,131072);
    auto &state=Transport(ctx);state.writers.at(id)->Write(reinterpret_cast<const unsigned char *>(bytes.data()),bytes.size());
    state.writeBytes+=bytes.size();if(state.progress)state.progress("write",state.writeBytes);
    if(state.cancel&&state.cancel->load())throw std::runtime_error("Operation cancelled");
    return JSValueMakeUndefined(ctx);
  });
}
static JSValueRef StreamClose(JSContextRef ctx,JSObjectRef,JSObjectRef,size_t n,const JSValueRef *args,JSValueRef *error) {
  try {
    if(n!=2)throw std::runtime_error("StreamClose expects handle and commit flag");
    int id=Integer(ctx,args[0],INT_MAX,error),commit=Integer(ctx,args[1],1,error);auto &state=Transport(ctx);
    if(commit){if(state.cancel && state.cancel->load())throw std::runtime_error("Operation cancelled");auto writer=state.writers.extract(id);if(writer.empty())throw std::runtime_error("Not an output stream");writer.mapped()->Commit();}
    else {state.readers.erase(id);state.writers.erase(id);}
    return JSValueMakeUndefined(ctx);
  }catch(const std::exception &e){Error(ctx,error,e.what());return JSValueMakeUndefined(ctx);}
}
static JSValueRef ByteHash(JSContextRef ctx,JSObjectRef,JSObjectRef,size_t n,const JSValueRef *args,JSValueRef *error) {
  return TransportCall(ctx,error,[&](){
    if(n!=1)throw std::runtime_error("Hash expects bytes");
    QByteArray bytes=ByteCopy(ctx,args[0],error,128*1024*1024),hash=QCryptographicHash::hash(bytes,QCryptographicHash::Sha256);
    return ByteValue(ctx,reinterpret_cast<const unsigned char *>(hash.data()),hash.size(),error);
  });
}
static JSValueRef DecodeUtf8(JSContextRef ctx,JSObjectRef,JSObjectRef,size_t n,const JSValueRef *args,JSValueRef *error) {
  return TransportCall(ctx,error,[&](){
    if(n!=1)throw std::runtime_error("Decode expects bytes");
    QByteArray bytes=ByteCopy(ctx,args[0],error,65536);QStringDecoder decoder(QStringDecoder::Utf8,QStringDecoder::Flag::Stateless);
    QString text=decoder(bytes);if(decoder.hasError())throw std::runtime_error("Invalid UTF-8");
    JSStringRef string=JSStringCreateWithCharacters(reinterpret_cast<const JSChar *>(text.utf16()),text.size());
    JSValueRef value=JSValueMakeString(ctx,string);JSStringRelease(string);return value;
  });
}
struct TransportScope {
  JSContextRef context;
  TransportState state;
  explicit TransportScope(JSGlobalContextRef ctx,std::atomic<bool> *cancel=nullptr):context(ctx) {
    state.cancel=cancel;
    JSObjectRef global=JSContextGetGlobalObject(ctx);
    if(JSObjectGetPrivate(global)||!JSObjectSetPrivate(global,&state))throw std::runtime_error("Cannot attach native transport");
    Bind(ctx,"NativeStreamOpen",StreamOpen);Bind(ctx,"NativeStreamReadInto",StreamReadInto);
    Bind(ctx,"NativeStreamWrite",StreamWrite);Bind(ctx,"NativeStreamClose",StreamClose);
    Bind(ctx,"NativeHash",ByteHash);Bind(ctx,"NativeDecode",DecodeUtf8);
  }
  ~TransportScope(){JSObjectSetPrivate(JSContextGetGlobalObject(context),nullptr);}
};
