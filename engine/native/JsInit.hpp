#pragma once
#include <QCoreApplication>
#include <QThread>
#include <atomic>
#include <stdexcept>
#ifdef Q_OS_LINUX
#include <jsc/jsc.h>
// JavaScriptCoreGTK's C API omits the main loop required by its deferred full GC.
namespace WTF {void initializeMainThread();}
#endif

inline void JsInit() {
  static std::atomic<bool> ready{false};
  if(ready.load())return;
  const auto app=QCoreApplication::instance();
  if(!app||QThread::currentThread()!=app->thread())
    throw std::runtime_error("Initialize JavaScriptCore on the application thread before starting workers");
#ifdef Q_OS_LINUX
  if(jsc_get_major_version()!=JSC_MAJOR_VERSION||jsc_get_minor_version()!=JSC_MINOR_VERSION||jsc_get_micro_version()!=JSC_MICRO_VERSION)
    throw std::runtime_error("JavaScriptCoreGTK changed since this build; rebuild the native host");
  WTF::initializeMainThread();
#endif
  ready.store(true);
}
