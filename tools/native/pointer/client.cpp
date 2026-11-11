#include "../../../engine/native/Pointer.hpp"
#include "Commands.hpp"
#include <QGuiApplication>
#include <QQuickWindow>
#include <QTimer>
int main(int argc,char **argv) {
  QGuiApplication app(argc,argv);QQuickWindow window;window.resize(640,480);window.setTitle("HEMU pointer test");
  PointerCapture pointer;
  QObject::connect(&pointer,&PointerCapture::changed,&app,[&]{Reply({{"event","state"},{"active",pointer.Active()},{"pending",pointer.Pending()}});});
  QObject::connect(&pointer,&PointerCapture::motion,&app,[&](double x,double y){Reply({{"event","motion"},{"dx",x},{"dy",y}});});
  QObject::connect(&pointer,&PointerCapture::error,&app,[&](QString error){Reply({{"event","error"},{"text",error}});});
  QObject::connect(&window,&QWindow::activeChanged,&app,[&]{Reply({{"event","focus"},{"active",window.isActive()}});});
  Commands commands([&](const QJsonObject &message){
    const auto op=message["cmd"].toString();
    if(op=="capture")pointer.Start(&window);
    else if(op=="release")pointer.Release();
    else if(op=="hide")window.hide();
    else if(op=="show")window.show();
    else if(op=="destroy")window.destroy();
    else if(op=="quit")app.quit();
    Reply({{"event","command"},{"cmd",op},{"active",window.isActive()},{"visible",window.isVisible()}});
  });
  window.show();Reply({{"event","ready"}});return app.exec();
}
