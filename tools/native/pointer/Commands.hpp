#pragma once
#include <QSocketNotifier>
#include <QJsonDocument>
#include <QJsonObject>
#include <functional>
#include <unistd.h>
#include <fcntl.h>
inline void Reply(const QJsonObject &value) {
  const auto bytes=QJsonDocument(value).toJson(QJsonDocument::Compact)+'\n';
  ::write(STDOUT_FILENO,bytes.constData(),bytes.size());
}
class Commands:public QObject {
  QSocketNotifier notifier{STDIN_FILENO,QSocketNotifier::Read,this};QByteArray bytes;
public:
  explicit Commands(std::function<void(const QJsonObject &)> handler) {
    fcntl(STDIN_FILENO,F_SETFL,fcntl(STDIN_FILENO,F_GETFL)|O_NONBLOCK);
    connect(&notifier,&QSocketNotifier::activated,this,[this,handler]{
      char buffer[4096];const auto count=::read(STDIN_FILENO,buffer,sizeof(buffer));
      if(count<=0){if(!count)notifier.setEnabled(false);return;}bytes.append(buffer,count);
      while(bytes.contains('\n')){const auto end=bytes.indexOf('\n');const auto line=bytes.left(end);bytes.remove(0,end+1);handler(QJsonDocument::fromJson(line).object());}
    });
  }
};
