#pragma once
#include <QDBusVirtualObject>
#include <QDBusMessage>
#include <QDBusConnection>
#include <QDBusArgument>
#include <QDBusObjectPath>
#include <QTimer>

class Portal:public QDBusVirtualObject {
  Q_OBJECT
public:
  QDBusConnection bus=QDBusConnection::connectToBus(QDBusConnection::SessionBus,"portal-fixture");
  int calls=0,replies=0,delay=0;bool early=false,wrongHandle=false,fail=false;
  QStringList closed;QString handle,title,method;QVariantMap options;
  QString introspect(const QString &)const override{return {};}
  void Response(const QString &path,uint code,const QStringList &uris) {
    auto message=QDBusMessage::createSignal(path,"org.freedesktop.portal.Request","Response");
    message<<code<<QVariantMap{{"uris",uris}};bus.send(message);
  }
  bool handleMessage(const QDBusMessage &message,const QDBusConnection &connection)override {
    if(message.member()=="Close") {closed<<message.path();connection.send(message.createReply());return true;}
    if(message.member()!="OpenFile"&&message.member()!="SaveFile")return false;
    calls++;method=message.member();title=message.arguments()[1].toString();options=qdbus_cast<QVariantMap>(message.arguments()[2]);
    if(fail){connection.send(message.createErrorReply("org.freedesktop.DBus.Error.Failed","fixture failure"));return true;}
    const auto sender=message.service().mid(1).replace('.','_');
    handle="/org/freedesktop/portal/desktop/request/"+sender+"/"+options["handle_token"].toString();
    const auto path=handle+(wrongHandle?"_different":"");
    if(early)Response(handle,0,{"file:///tmp/a%20b.hemu"});
    QTimer::singleShot(delay,this,[this,message,connection,path]{connection.send(message.createReply(QVariant::fromValue(QDBusObjectPath(path))));replies++;});
    return true;
  }
};
