#pragma once
#include <QObject>
#include <QPointer>
#include <QWindow>
#include <memory>

class PointerCapture:public QObject {
  Q_OBJECT
  struct Platform;
  std::unique_ptr<Platform> platform;
  QPointer<QWindow> window;
  bool active=false,pending=false;
  QMetaObject::Connection destroyed;
  bool eventFilter(QObject *,QEvent *)override;
public:
  explicit PointerCapture(QObject *parent=nullptr);
  ~PointerCapture();
  bool Active()const{return active;}
  bool Pending()const{return pending;}
  void Start(QWindow *target);
  void Release();
signals:
  void changed();
  void motion(double dx,double dy);
  void error(QString message);
};
