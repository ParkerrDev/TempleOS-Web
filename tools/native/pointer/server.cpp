#include "Commands.hpp"
#include <QGuiApplication>
#include <QWindow>
#include <QTimer>
#include <QPointer>
#include <QtWaylandCompositor/QWaylandCompositor>
#include <QtWaylandCompositor/QWaylandXdgShell>
#include <QtWaylandCompositor/QWaylandOutput>
#include <QtWaylandCompositor/QWaylandSeat>
#include <QtWaylandCompositor/QWaylandView>
#include <QtWaylandCompositor/QWaylandSurfaceGrabber>
#include <QImage>
#include <QtWaylandCompositor/private/qwaylandkeyboard_p.h>
#include <wayland-server.h>
#include "constraints-server.h"
#include "relative-server.h"

struct Protocol {
  wl_display *display;
  wl_global *constraints=nullptr,*relativeGlobal=nullptr;
  wl_resource *lock=nullptr,*relative=nullptr;
  bool grant=true,active=false;
  static void Destroy(wl_client *,wl_resource *resource){wl_resource_destroy(resource);}
  static void Hint(wl_client *,wl_resource *,wl_fixed_t,wl_fixed_t){}
  static void Region(wl_client *,wl_resource *,wl_resource *){}
  static void LockGone(wl_resource *resource){auto &p=*static_cast<Protocol *>(wl_resource_get_user_data(resource));p.lock=nullptr;p.active=false;Reply({{"event","lock-destroyed"}});}
  static void RelativeGone(wl_resource *resource){auto &p=*static_cast<Protocol *>(wl_resource_get_user_data(resource));p.relative=nullptr;Reply({{"event","relative-destroyed"}});}
  static void Lock(wl_client *client,wl_resource *resource,uint32_t id,wl_resource *,wl_resource *,wl_resource *,uint32_t lifetime) {
    auto &p=*static_cast<Protocol *>(wl_resource_get_user_data(resource));
    if(p.lock){wl_resource_post_error(resource,1,"duplicate lock");return;}
    p.lock=wl_resource_create(client,&zwp_locked_pointer_v1_interface,1,id);
    static const struct zwp_locked_pointer_v1_interface implementation={Destroy,Hint,Region};
    wl_resource_set_implementation(p.lock,&implementation,&p,LockGone);
    Reply({{"event","lock-request"},{"lifetime",static_cast<int>(lifetime)}});
    if(p.grant){p.active=true;zwp_locked_pointer_v1_send_locked(p.lock);}
  }
  static void Confine(wl_client *,wl_resource *resource,uint32_t,wl_resource *,wl_resource *,wl_resource *,uint32_t){wl_resource_post_error(resource,1,"confinement not implemented by test server");}
  static void BindConstraints(wl_client *client,void *data,uint32_t,uint32_t id) {
    auto *resource=wl_resource_create(client,&zwp_pointer_constraints_v1_interface,1,id);
    static const struct zwp_pointer_constraints_v1_interface implementation={Destroy,Lock,Confine};
    wl_resource_set_implementation(resource,&implementation,data,nullptr);
  }
  static void Relative(wl_client *client,wl_resource *resource,uint32_t id,wl_resource *) {
    auto &p=*static_cast<Protocol *>(wl_resource_get_user_data(resource));p.relative=wl_resource_create(client,&zwp_relative_pointer_v1_interface,1,id);
    static const struct zwp_relative_pointer_v1_interface implementation={Destroy};wl_resource_set_implementation(p.relative,&implementation,&p,RelativeGone);
  }
  static void BindRelative(wl_client *client,void *data,uint32_t,uint32_t id) {
    auto *resource=wl_resource_create(client,&zwp_relative_pointer_manager_v1_interface,1,id);
    static const struct zwp_relative_pointer_manager_v1_interface implementation={Destroy,Relative};wl_resource_set_implementation(resource,&implementation,data,nullptr);
  }
  Protocol(wl_display *value):display(value) {
    constraints=wl_global_create(display,&zwp_pointer_constraints_v1_interface,1,this,BindConstraints);
    relativeGlobal=wl_global_create(display,&zwp_relative_pointer_manager_v1_interface,1,this,BindRelative);
  }
  ~Protocol(){if(constraints)wl_global_destroy(constraints);if(relativeGlobal)wl_global_destroy(relativeGlobal);}
};
int main(int argc,char **argv) {
  QGuiApplication app(argc,argv);if(argc!=2)return 2;
  QWaylandCompositor compositor;compositor.setSocketName(argv[1]);QWaylandXdgShell shell(&compositor);compositor.create();
  QWindow window;window.resize(1024,768);QWaylandOutput output(&compositor,&window);
  const QWaylandOutputMode mode(QSize(1024,768),60000);output.addMode(mode,true);output.setCurrentMode(mode);
  Protocol protocol(compositor.display());QPointer<QWaylandView> view;QPointer<QWaylandXdgToplevel> top;
  QString watchPath;bool grabbing=false;
  QObject::connect(&shell,&QWaylandXdgShell::toplevelCreated,&app,[&](QWaylandXdgToplevel *value,QWaylandXdgSurface *surface){
    top=value;view=new QWaylandView(nullptr,&compositor);view->setSurface(surface->surface());view->setOutput(&output);
    top->sendConfigure(QSize(640,480),QList<QWaylandXdgToplevel::State>{QWaylandXdgToplevel::ActivatedState});
    compositor.defaultSeat()->setKeyboardFocus(surface->surface());
    QObject::connect(surface->surface(),&QWaylandSurface::hasContentChanged,&app,[&]{
      if(view&&view->surface()&&view->surface()->hasContent()){compositor.defaultSeat()->sendMouseMoveEvent(view,{320,240});Reply({{"event","surface"}});}
    });
    QObject::connect(surface->surface(),&QWaylandSurface::redraw,&app,[&]{
      if(watchPath.isEmpty()||grabbing||!view||!view->surface())return;
      grabbing=true;auto *grab=new QWaylandSurfaceGrabber(view->surface(),&app);
      QObject::connect(grab,&QWaylandSurfaceGrabber::success,&app,[&,grab](const QImage &image){
        int white=0,blue=0;
        for(int y=0;y<image.height();y++)for(int x=0;x<image.width();x++) {
          const auto rgb=image.pixel(x,y)&0xFFFFFF;if(rgb==0xFFFFFF)white++;else if(rgb==0x0000AA)blue++;
        }
        if(white>100000&&blue>3000){const auto saved=image.save(watchPath);watchPath.clear();Reply({{"event","guest-frame"},{"saved",saved},{"width",image.width()},{"height",image.height()},{"white",white},{"blue",blue}});}
        grabbing=false;grab->deleteLater();
      });
      QObject::connect(grab,&QWaylandSurfaceGrabber::failed,&app,[&,grab](QWaylandSurfaceGrabber::Error error){Reply({{"event","grab-error"},{"code",static_cast<int>(error)}});grabbing=false;grab->deleteLater();});
      grab->grab();
    });
  });
  QTimer frames;frames.setInterval(16);QObject::connect(&frames,&QTimer::timeout,&app,[&]{if(view&&view->surface())view->surface()->sendFrameCallbacks();});frames.start();
  Commands commands([&](const QJsonObject &message){
    const auto op=message["cmd"].toString();
    if(op=="delta"&&protocol.relative)zwp_relative_pointer_v1_send_relative_motion(protocol.relative,0,1,
      wl_fixed_from_double(99),wl_fixed_from_double(88),wl_fixed_from_double(message["dx"].toDouble()),wl_fixed_from_double(message["dy"].toDouble()));
    else if(op=="key"){
      const auto code=message["code"].toInt()+8;const bool down=message["down"].toBool();
      auto *keyboard=QWaylandKeyboardPrivate::get(compositor.defaultSeat()->keyboard());
      //The public send API omits the compositor's input-device modifier update.
      keyboard->keyEvent(code,down?WL_KEYBOARD_KEY_STATE_PRESSED:WL_KEYBOARD_KEY_STATE_RELEASED);
      keyboard->updateModifierState(code,down?WL_KEYBOARD_KEY_STATE_PRESSED:WL_KEYBOARD_KEY_STATE_RELEASED);
      if(down)compositor.defaultSeat()->sendKeyPressEvent(code);else compositor.defaultSeat()->sendKeyReleaseEvent(code);
    }
    else if(op=="click"){compositor.defaultSeat()->sendMousePressEvent(Qt::LeftButton);compositor.defaultSeat()->sendMouseReleaseEvent(Qt::LeftButton);}
    else if(op=="unlock"&&protocol.lock){protocol.active=false;zwp_locked_pointer_v1_send_unlocked(protocol.lock);}
    else if(op=="activate"&&protocol.lock){protocol.active=true;zwp_locked_pointer_v1_send_locked(protocol.lock);}
    else if(op=="deny")protocol.grant=false;
    else if(op=="grant")protocol.grant=true;
    else if(op=="focus"&&top){top->sendConfigure(QSize(640,480),QList<QWaylandXdgToplevel::State>{QWaylandXdgToplevel::ActivatedState});compositor.defaultSeat()->setKeyboardFocus(view->surface());compositor.defaultSeat()->sendMouseMoveEvent(view,{320,240});}
    else if(op=="blur"&&top){top->sendConfigure(QSize(640,480),QList<QWaylandXdgToplevel::State>{});compositor.defaultSeat()->setKeyboardFocus(nullptr);}
    else if(op=="remove"){wl_global_destroy(protocol.constraints);protocol.constraints=nullptr;}
    else if(op=="restore"&&!protocol.constraints)protocol.constraints=wl_global_create(compositor.display(),&zwp_pointer_constraints_v1_interface,1,&protocol,Protocol::BindConstraints);
    else if(op=="quiet")frames.stop();
    else if(op=="watch-frame")watchPath=message["path"].toString();
    else if(op=="quit")app.quit();
    wl_display_flush_clients(compositor.display());Reply({{"event","command"},{"cmd",op}});
  });
  Reply({{"event","ready"}});return app.exec();
}
