#pragma once
#include <JavaScriptCore/JavaScript.h>
#include <QByteArray>
#include <QString>
#include <cstring>
#include <cstdlib>
#include <stdexcept>
#include <vector>

inline std::string String(JSContextRef ctx,JSValueRef value) {
  JSStringRef text=JSValueToStringCopy(ctx,value,nullptr);
  std::vector<char> bytes(JSStringGetMaximumUTF8CStringSize(text));
  size_t count=JSStringGetUTF8CString(text,bytes.data(),bytes.size());JSStringRelease(text);
  return std::string(bytes.data(),count?count-1:0);
}
inline void Error(JSContextRef ctx,JSValueRef *error,const std::string &message) {
  JSStringRef text=JSStringCreateWithUTF8CString(message.c_str());
  *error=JSValueMakeString(ctx,text);JSStringRelease(text);
}
inline void FreeBytes(void *bytes,void *) {free(bytes);}
inline void Bind(JSGlobalContextRef ctx,const char *name,JSObjectCallAsFunctionCallback callback) {
  JSStringRef key=JSStringCreateWithUTF8CString(name);
  JSObjectSetProperty(ctx,JSContextGetGlobalObject(ctx),key,JSObjectMakeFunctionWithCallback(ctx,key,callback),kJSPropertyAttributeNone,nullptr);
  JSStringRelease(key);
}
inline std::string Eval(JSGlobalContextRef ctx,const std::string &source) {
  JSStringRef code=JSStringCreateWithUTF8CString(source.c_str());JSValueRef error=nullptr;
  JSValueRef result=JSEvaluateScript(ctx,code,nullptr,nullptr,1,&error);JSStringRelease(code);
  if(error)throw std::runtime_error(String(ctx,error));
  return String(ctx,result);
}
