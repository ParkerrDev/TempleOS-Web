#include "Pointer.hpp"
#include <QGuiApplication>
#include <QTimer>
#include <QEvent>
#include <QPlatformSurfaceEvent>
#include <cstring>
#ifdef Q_OS_LINUX
#include <qpa/qplatformnativeinterface.h>
#include <wayland-client.h>
#include "constraints.h"
#include "relative.h"
#endif

struct PointerCapture::Platform {
  PointerCapture *owner;
  QTimer timeout;
#ifdef Q_OS_LINUX
  wl_display *display=nullptr;
  wl_registry *registry=nullptr;
  zwp_pointer_constraints_v1 *constraints=nullptr;
  zwp_relative_pointer_manager_v1 *manager=nullptr;
  zwp_locked_pointer_v1 *lock=nullptr;
  zwp_relative_pointer_v1 *relative=nullptr;
  uint32_t constraintsName=0,managerName=0;
  static void Global(void *data,wl_registry *registry,uint32_t name,const char *interface,uint32_t) {
    auto &self=*static_cast<Platform *>(data);
    if(!strcmp(interface,zwp_pointer_constraints_v1_interface.name)&&!self.constraints) {
      self.constraints=static_cast<zwp_pointer_constraints_v1 *>(wl_registry_bind(registry,name,&zwp_pointer_constraints_v1_interface,1));self.constraintsName=name;
    } else if(!strcmp(interface,zwp_relative_pointer_manager_v1_interface.name)&&!self.manager) {
      self.manager=static_cast<zwp_relative_pointer_manager_v1 *>(wl_registry_bind(registry,name,&zwp_relative_pointer_manager_v1_interface,1));self.managerName=name;
    }
  }
  static void Removed(void *data,wl_registry *,uint32_t name) {
    auto &self=*static_cast<Platform *>(data);
    if(name!=self.constraintsName&&name!=self.managerName)return;
    self.owner->Release();
    if(name==self.constraintsName){zwp_pointer_constraints_v1_destroy(self.constraints);self.constraints=nullptr;self.constraintsName=0;}
    if(name==self.managerName){zwp_relative_pointer_manager_v1_destroy(self.manager);self.manager=nullptr;self.managerName=0;}
  }
  static void Locked(void *data,zwp_locked_pointer_v1 *) {
    auto &self=*static_cast<Platform *>(data);self.timeout.stop();
    if(!self.owner->window||!self.owner->window->isActive()){self.owner->Release();return;}
    self.owner->pending=false;self.owner->active=true;self.owner->window->setCursor(Qt::BlankCursor);emit self.owner->changed();
  }
  static void Unlocked(void *data,zwp_locked_pointer_v1 *) {static_cast<Platform *>(data)->owner->Release();}
  static void Motion(void *data,zwp_relative_pointer_v1 *,uint32_t,uint32_t,wl_fixed_t,wl_fixed_t,wl_fixed_t dx,wl_fixed_t dy) {
    auto &self=*static_cast<Platform *>(data);
    if(self.owner->active)emit self.owner->motion(wl_fixed_to_double(dx),wl_fixed_to_double(dy));
  }
#endif
  explicit Platform(PointerCapture *value):owner(value) {
    timeout.setSingleShot(true);timeout.setInterval(5000);
    QObject::connect(&timeout,&QTimer::timeout,owner,[this]{owner->Release();emit owner->error(QObject::tr("The compositor did not grant pointer capture. Click the screen to retry."));});
#ifdef Q_OS_LINUX
    if(strcmp(qVersion(),QT_VERSION_STR))return;
    const auto app=qGuiApp->nativeInterface<QNativeInterface::QWaylandApplication>();
    if(!app)return;
    display=app->display();registry=wl_display_get_registry(display);
    //Qt dispatches its default queue on the GUI thread, including our listeners.
    static const wl_registry_listener listener={Global,Removed};wl_registry_add_listener(registry,&listener,this);
    wl_display_flush(display);
#endif
  }
  ~Platform() {
    timeout.stop();
#ifdef Q_OS_LINUX
    if(relative)zwp_relative_pointer_v1_destroy(relative);
    if(lock)zwp_locked_pointer_v1_destroy(lock);
    if(manager)zwp_relative_pointer_manager_v1_destroy(manager);
    if(constraints)zwp_pointer_constraints_v1_destroy(constraints);
    if(registry)wl_registry_destroy(registry);
#endif
  }
};

PointerCapture::PointerCapture(QObject *parent):QObject(parent),platform(std::make_unique<Platform>(this)){}
PointerCapture::~PointerCapture(){Release();}
void PointerCapture::Start(QWindow *target) {
  if(active||pending)return;
  if(!target||!target->isVisible()||!target->isActive()){emit error(tr("Focus the TempleOS window before capturing the pointer"));return;}
#ifdef Q_OS_LINUX
  auto &p=*platform;
  if(strcmp(qVersion(),QT_VERSION_STR)){emit error(tr("Qt changed since this build; rebuild the native pointer adapter"));return;}
  const auto app=qGuiApp->nativeInterface<QNativeInterface::QWaylandApplication>();
  if(!app||!p.constraints||!p.manager||!app->pointer()) {emit error(tr("Relative capture requires Wayland pointer-constraints and relative-pointer support"));return;}
  //Qt has no public wl_surface accessor. Keep this QPA boundary in the platform adapter.
  auto *surface=static_cast<wl_surface *>(QGuiApplication::platformNativeInterface()->nativeResourceForWindow("surface",target));
  if(!surface){emit error(tr("The window's native Wayland surface is unavailable"));return;}
  window=target;pending=true;target->installEventFilter(this);
  destroyed=connect(target,&QObject::destroyed,this,[this]{Release();});
  p.relative=zwp_relative_pointer_manager_v1_get_relative_pointer(p.manager,app->pointer());
  static const zwp_relative_pointer_v1_listener relativeListener={Platform::Motion};
  zwp_relative_pointer_v1_add_listener(p.relative,&relativeListener,&p);
  p.lock=zwp_pointer_constraints_v1_lock_pointer(p.constraints,surface,app->pointer(),nullptr,ZWP_POINTER_CONSTRAINTS_V1_LIFETIME_ONESHOT);
  static const zwp_locked_pointer_v1_listener lockListener={Platform::Locked,Platform::Unlocked};
  zwp_locked_pointer_v1_add_listener(p.lock,&lockListener,&p);
  p.timeout.start();wl_display_flush(p.display);emit changed();
#else
  emit error(tr("Relative pointer capture is not implemented on this platform"));
#endif
}
void PointerCapture::Release() {
  auto &p=*platform;p.timeout.stop();const bool was=active||pending;active=pending=false;
#ifdef Q_OS_LINUX
  if(p.relative){zwp_relative_pointer_v1_destroy(p.relative);p.relative=nullptr;}
  if(p.lock){zwp_locked_pointer_v1_destroy(p.lock);p.lock=nullptr;}
  if(p.display)wl_display_flush(p.display);
#endif
  disconnect(destroyed);
  if(window){window->removeEventFilter(this);window->unsetCursor();}
  window.clear();
  if(was)emit changed();
}

bool PointerCapture::eventFilter(QObject *,QEvent *event) {
  if(event->type()==QEvent::WindowDeactivate||event->type()==QEvent::Hide||event->type()==QEvent::Close||
      (event->type()==QEvent::PlatformSurface&&static_cast<QPlatformSurfaceEvent *>(event)->surfaceEventType()==QPlatformSurfaceEvent::SurfaceAboutToBeDestroyed))Release();
  return false;
}
