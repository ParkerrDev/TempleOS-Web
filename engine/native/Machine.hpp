#pragma once
#include "Transport.hpp"
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QFile>
#include <cstdio>

inline JSValueRef NativeUtf8(JSContextRef ctx,JSObjectRef,JSObjectRef,size_t n,const JSValueRef *args,JSValueRef *error) {
  return TransportCall(ctx,error,[&](){
    const std::string value=n?String(ctx,args[0]):"";
    return ByteValue(ctx,reinterpret_cast<const unsigned char *>(value.data()),value.size(),error);
  });
}
inline JSValueRef NativeAtob(JSContextRef ctx,JSObjectRef,JSObjectRef,size_t n,const JSValueRef *args,JSValueRef *error) {
  return TransportCall(ctx,error,[&](){
    if(n!=1)throw std::runtime_error("atob expects one encoded string");
    const auto input=QByteArray::fromStdString(String(ctx,args[0]));
    if(input.size()>1048576)throw std::runtime_error("Encoded string exceeds native bound");
    const auto decoded=QByteArray::fromBase64Encoding(input,QByteArray::AbortOnBase64DecodingErrors);
    if(!decoded)throw std::runtime_error("Invalid base64 string");
    const QString text=QString::fromLatin1(decoded.decoded);
    JSStringRef string=JSStringCreateWithCharacters(reinterpret_cast<const JSChar *>(text.utf16()),text.size());
    JSValueRef value=JSValueMakeString(ctx,string);JSStringRelease(string);return value;
  });
}
inline JSValueRef NativeLog(JSContextRef ctx,JSObjectRef,JSObjectRef,size_t n,const JSValueRef *args,JSValueRef *) {
  for(size_t i=0;i<n;i++)fprintf(stderr,"%s",String(ctx,args[i]).c_str());
  return JSValueMakeUndefined(ctx);
}
inline JSValueRef NativeFrame(JSContextRef ctx,JSObjectRef,JSObjectRef,size_t n,const JSValueRef *args,JSValueRef *error) {
  return TransportCall(ctx,error,[&](){
    if(n!=2)throw std::runtime_error("Frame expects pixels and palette");
    const QByteArray pixels=ByteCopy(ctx,args[0],error,640*480);
    if(pixels.size()!=640*480)throw std::runtime_error("Invalid frame length");
    JSObjectRef palette=JSValueToObject(ctx,args[1],error);QList<QRgb> colors;
    for(unsigned i=0;i<16;i++) {
      double rgb=JSValueToNumber(ctx,JSObjectGetPropertyAtIndex(ctx,palette,i,error),error);
      if(*error||!std::isfinite(rgb)||rgb<0||rgb>0xFFFFFF)throw std::runtime_error("Invalid frame palette");
      colors.append(0xFF000000u|static_cast<unsigned>(rgb));
    }
    QImage image(reinterpret_cast<const uchar *>(pixels.data()),640,480,640,QImage::Format_Indexed8);
    image.setColorTable(colors);Transport(ctx).image=image.copy();
    return JSValueMakeUndefined(ctx);
  });
}

class Machine {
  JSGlobalContextRef context=nullptr;
  std::unique_ptr<TransportScope> transport;
public:
  explicit Machine(std::atomic<bool> *cancel,std::function<void(const char *,size_t)> progress={}) {
    JSClassDefinition definition=kJSClassDefinitionEmpty;definition.className="HemuNative";
    JSClassRef type=JSClassCreate(&definition);context=JSGlobalContextCreate(type);JSClassRelease(type);
    try {
      transport=std::make_unique<TransportScope>(context,cancel);
      transport->state.progress=std::move(progress);
      Bind(context,"NativeAtob",NativeAtob);Bind(context,"NativeUtf8",NativeUtf8);Bind(context,"NativeLog",NativeLog);Bind(context,"NativeFrame",NativeFrame);
      QFile file(":/hemu/Runtime.js");if(!file.open(QIODevice::ReadOnly))throw std::runtime_error("Missing native runtime bundle");
      Eval(context,file.readAll().toStdString());
    } catch(...) {transport.reset();JSGlobalContextRelease(context);context=nullptr;throw;}
  }
  Machine(const Machine &)=delete;
  ~Machine(){transport.reset();if(context)JSGlobalContextRelease(context);}
  QJsonValue Call(const char *method,const QJsonArray &args={}) {
    QByteArray json=QJsonDocument(args).toJson(QJsonDocument::Compact);json=json.mid(1,json.size()-2);
    Eval(context,"globalThis.NativeResult=null;Promise.resolve(Hemu."+std::string(method)+"("+json.toStdString()+")).then(value=>NativeResult={ok:true,value},error=>NativeResult={ok:false,error:String(error)});");
    const auto result=QJsonDocument::fromJson(QByteArray::fromStdString(Eval(context,"JSON.stringify(NativeResult)"))).object();
    if(result.isEmpty())throw std::runtime_error("Native operation did not settle");
    if(!result["ok"].toBool())throw std::runtime_error(result["error"].toString().toStdString());
    return result["value"];
  }
  QImage Image(){Call("Frame");return transport->state.image;}
};
