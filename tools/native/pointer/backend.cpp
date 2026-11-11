#include "../../../engine/native/App.hpp"
#include "Commands.hpp"
#include <QJsonDocument>

class KeyTrace:public QObject {
  QQuickWindow *window;
public:
  explicit KeyTrace(QQuickWindow *value):window(value){}
  bool eventFilter(QObject *target,QEvent *event)override {
    if(target==window&&(event->type()==QEvent::KeyPress||event->type()==QEvent::KeyRelease)) {
      const auto *key=static_cast<QKeyEvent *>(event);
      Reply({{"event","native-key"},{"key",key->key()},{"modifiers",static_cast<int>(key->modifiers())},{"scan",static_cast<int>(key->nativeScanCode())},{"down",event->type()==QEvent::KeyPress}});
    }
    return false;
  }
};
static void Settle(Machine &machine,const QString &source) {
  const auto id=machine.Call("Exec",{source});
  for(int i=0;i<2000;i++) {
    machine.Call("Tick",{16000000});const auto job=machine.Call("Job",{id}).toObject();
    if(job["state"]=="done")return;
    if(job["state"]=="failed")throw std::runtime_error(QJsonDocument(job).toJson().toStdString());
  }
  throw std::runtime_error("Guest fixture did not finish");
}
int main(int argc,char **argv) {
  QGuiApplication app(argc,argv);
  if(argc==5&&QString::fromLocal8Bit(argv[1])=="prepare") {
    try {
      std::atomic<bool> cancel{false};Machine machine(&cancel);machine.Call("Open",{QString::fromLocal8Bit(argv[2])});machine.Call("Pause",{false});
      Settle(machine,"ms.show=FALSE;MsSet(320,240);I64 pointer_seen=0;U0 PointerWatch() {while(TRUE){if(ms.pos.x==333 && ms.pos.y==233)pointer_seen++;Sleep(1);}}Spawn(&PointerWatch);");machine.Call("Pause",{true});machine.Call("Save",{QString::fromLocal8Bit(argv[3])});
      machine.Call("Pause",{false});
      Settle(machine,"U0 PointerFault() {Sleep(3000);asm {DU8 0xD9,0xD1;}}Spawn(&PointerFault);");
      machine.Call("Pause",{true});machine.Call("Save",{QString::fromLocal8Bit(argv[4])});
      Reply({{"event","prepared"}});return 0;
    }catch(const std::exception &error){fprintf(stderr,"%s\n",error.what());return 1;}
  }
  if(argc==3&&QString::fromLocal8Bit(argv[1])=="inspect") {
    try {
      std::atomic<bool> cancel{false};Machine machine(&cancel);machine.Call("Open",{QString::fromLocal8Bit(argv[2])});machine.Call("Pause",{false});
      Settle(machine,"if(!pointer_seen)throw('NoMove');");Reply({{"event","native-motion-observed"}});return 0;
    }catch(const std::exception &error){fprintf(stderr,"%s\n",error.what());return 1;}
  }
  qmlRegisterType<Screen>("HemuNative",1,0,"HemuScreen");Backend backend;
  QQmlApplicationEngine qml;qml.rootContext()->setContextProperty("backend",&backend);qml.load(QUrl("qrc:/hemu/Main.qml"));
  if(qml.rootObjects().isEmpty())return 2;
  auto *window=qobject_cast<QQuickWindow *>(qml.rootObjects().first());backend.Attach(window);KeyTrace trace(window);app.installEventFilter(&trace);
  QJsonObject previous;
  const auto State=[&]{
    QJsonObject state={{"event","state"},{"ready",backend.ready()},{"busy",backend.busy()},{"paused",backend.paused()},
      {"captured",backend.captured()},{"wanted",backend.captureWanted()},{"fault",backend.faulted()},{"status",backend.status()},{"path",backend.path()}};
    if(state!=previous){previous=state;Reply(state);}
  };
  QObject::connect(&backend,&Backend::changed,&app,State);
  QObject::connect(&backend,&Backend::imageChanged,&app,[]{Reply({{"event","frame"}});});
  QObject::connect(&backend,&Backend::keyRequested,&app,[&](int code,bool down){Reply({{"event","key"},{"code",code},{"down",down}});});
  QObject::connect(&backend,&Backend::releaseRequested,&app,[]{Reply({{"event","keys-released"}});});
  QObject::connect(&backend,&Backend::mouseRequested,&app,[&](QJsonObject value){value["event"]="mouse";Reply(value);});
  QObject::connect(window,&QWindow::activeChanged,&app,[&]{Reply({{"event","focus"},{"active",window->isActive()}});});
  Commands commands([&](const QJsonObject &message){
    const auto op=message["cmd"].toString();
    if(op=="open")backend.open(message["path"].toString());
    else if(op=="save")backend.save(message["path"].toString());
    else if(op=="pause")backend.pause();
    else if(op=="cancel")backend.cancel();
    else if(op=="quit")app.quit();
    Reply({{"event","command"},{"cmd",op}});
  });
  State();Reply({{"event","ready"}});return app.exec();
}
