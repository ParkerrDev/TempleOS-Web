#include "../../../engine/native/Pointer.hpp"
#include "Commands.hpp"
#include <QGuiApplication>
#include <QQuickWindow>
#include <QTimer>
#include <QAbstractEventDispatcher>
#include <QThread>
#include <wayland-client.h>
int main(int argc,char **argv) {
  QGuiApplication app(argc,argv);QQuickWindow window;window.resize(640,480);window.setTitle("HEMU pointer test");
  PointerCapture pointer;int wakes=0;
  QObject::connect(QAbstractEventDispatcher::instance(),&QAbstractEventDispatcher::awake,&app,[&]{wakes++;});
  const auto OnGui=[&]{if(QThread::currentThread()!=app.thread())qFatal("Pointer callback escaped the GUI thread");};
  QObject::connect(&pointer,&PointerCapture::changed,&app,[&]{OnGui();Reply({{"event","state"},{"active",pointer.Active()},{"pending",pointer.Pending()}});},Qt::DirectConnection);
  QObject::connect(&pointer,&PointerCapture::motion,&app,[&](double x,double y){OnGui();Reply({{"event","motion"},{"dx",x},{"dy",y}});},Qt::DirectConnection);
  QObject::connect(&pointer,&PointerCapture::error,&app,[&](QString error){OnGui();Reply({{"event","error"},{"text",error}});},Qt::DirectConnection);
  QObject::connect(&window,&QWindow::activeChanged,&app,[&]{Reply({{"event","focus"},{"active",window.isActive()}});});
  Commands commands([&](const QJsonObject &message){
    const auto op=message["cmd"].toString();
    if(op=="capture")pointer.Start(&window);
    else if(op=="release")pointer.Release();
    else if(op=="hide")window.hide();
    else if(op=="show")window.show();
    else if(op=="destroy")window.destroy();
    else if(op=="idle") {
      const auto start=wakes;QTimer::singleShot(500,&app,[&,start]{Reply({{"event","idle"},{"wakes",wakes-start}});});
    } else if(op=="sync") {
      const auto display=qGuiApp->nativeInterface<QNativeInterface::QWaylandApplication>()->display();
      const auto callback=wl_display_sync(display);
      static const wl_callback_listener listener={[](void *,wl_callback *callback,uint32_t){wl_callback_destroy(callback);Reply({{"event","synced"}});}};
      wl_callback_add_listener(callback,&listener,nullptr);wl_display_flush(display);
    } else if(op=="quit")app.quit();
    Reply({{"event","command"},{"cmd",op},{"active",window.isActive()},{"visible",window.isVisible()}});
  });
  window.show();Reply({{"event","ready"}});return app.exec();
}
