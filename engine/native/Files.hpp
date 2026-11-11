#pragma once
#include <QObject>
#include <QDBusConnection>
#include <QDBusMessage>
#include <QDBusObjectPath>
#include <QDBusPendingCallWatcher>
#include <QDBusPendingReply>
#include <QDBusServiceWatcher>
#include <QFileInfo>
#include <QUrl>
#include <QUuid>

class Files:public QObject {
  Q_OBJECT
  const QString service="org.freedesktop.portal.Desktop",requestInterface="org.freedesktop.portal.Request";
  QDBusConnection bus=QDBusConnection::sessionBus();
  QDBusServiceWatcher portalWatch{service,bus,QDBusServiceWatcher::WatchForUnregistration};
  QString handle;quint64 generation=0;bool saving=false;
  void Close(const QString &path){if(!path.isEmpty())bus.asyncCall(QDBusMessage::createMethodCall(service,path,requestInterface,"Close"));}
  void Clear() {
    if(handle.isEmpty())return;
    bus.disconnect(service,handle,requestInterface,"Response",this,SLOT(Response(uint,QVariantMap,QDBusMessage)));
    handle.clear();generation++;emit changed();
  }
private slots:
  void Response(uint code,const QVariantMap &result,const QDBusMessage &message) {
    if(handle.isEmpty()||message.path()!=handle)return;
    const bool save=saving;Clear();
    if(code==1){emit cancelled();return;}
    if(code!=0){emit error(tr("The desktop file picker did not complete the request"));return;}
    const auto uris=result.value("uris").toStringList();
    if(uris.size()!=1){emit error(tr("Select one complete .hemu session"));return;}
    QUrl url(uris.first());
    if(!url.isValid()||!url.isLocalFile()||(!url.host().isEmpty()&&url.host()!="localhost")||url.toLocalFile().isEmpty()||url.toLocalFile().contains(QChar(0))) {
      emit error(tr("The desktop file picker did not return a local file"));return;
    }
    url.setHost({});emit selected(url.toLocalFile(),save);
  }
public:
  explicit Files(QObject *parent=nullptr):QObject(parent){
    connect(&portalWatch,&QDBusServiceWatcher::serviceUnregistered,this,[this]{
      if(Pending()){Clear();emit error(tr("The desktop file picker closed before completing the request"));}
    });
  }
  ~Files(){Close(handle);}
  bool Pending()const{return !handle.isEmpty();}
  void Cancel(){if(!Pending())return;const auto path=handle;Clear();Close(path);emit cancelled();}
  void Choose(bool save,const QString &current) {
    if(Pending())return;
    if(!bus.isConnected()){emit error(tr("The desktop file picker requires a session D-Bus connection"));return;}
    const auto token="hemu_"+QUuid::createUuid().toString(QUuid::WithoutBraces).remove('-');
    const auto sender=bus.baseService().mid(1).replace('.','_');
    handle="/org/freedesktop/portal/desktop/request/"+sender+"/"+token;saving=save;
    const auto path=handle;const auto id=++generation;
    if(!bus.connect(service,handle,requestInterface,"Response",this,SLOT(Response(uint,QVariantMap,QDBusMessage)))) {
      Clear();emit error(tr("Cannot receive the desktop file picker response"));return;
    }
    QVariantMap options={{"handle_token",token},{"modal",true},{"multiple",false}};
    if(save)options["current_name"]=current.isEmpty()?QString("TempleOS.hemu"):QFileInfo(current).fileName();
    auto call=QDBusMessage::createMethodCall(service,"/org/freedesktop/portal/desktop","org.freedesktop.portal.FileChooser",save?"SaveFile":"OpenFile");
    call<<QString()<<(save?tr("Save TempleOS session"):tr("Open TempleOS session"))<<options;
    auto *watcher=new QDBusPendingCallWatcher(bus.asyncCall(call),this);
    connect(watcher,&QDBusPendingCallWatcher::finished,this,[this,id,path](QDBusPendingCallWatcher *watcher){
      const QDBusPendingReply<QDBusObjectPath> reply=*watcher;watcher->deleteLater();
      if(id!=generation){if(!reply.isError())Close(reply.value().path());return;}
      if(reply.isError()){const auto reason=reply.error().message();Clear();emit error(tr("Desktop file picker failed: %1").arg(reason));return;}
      if(reply.value().path()!=path){Close(reply.value().path());Clear();emit error(tr("The desktop portal returned an unexpected request handle"));}
    });
    emit changed();
  }
signals:
  void selected(QString path,bool save);void cancelled();void changed();void error(QString message);
};
