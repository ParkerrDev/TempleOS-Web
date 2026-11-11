#include "App.hpp"

int main(int argc,char **argv) try {
  const bool check=argc>1&&QString::fromLocal8Bit(argv[1])=="check";
  if(check)qputenv("QT_QPA_PLATFORM","offscreen");
  QGuiApplication app(argc,argv);app.setDesktopFileName("hemu-native");
  if(check) {
    if(argc<3){fprintf(stderr,"hemu-native check session.hemu [ticks]\n");return 2;}
    try {
      std::atomic<bool> cancel{false};Machine machine(&cancel);
      auto state=machine.Call("Open",{QString::fromLocal8Bit(argv[2])});
      const int ticks=argc>3?QString::fromLocal8Bit(argv[3]).toInt():0;
      if(ticks<0||ticks>10000)throw std::runtime_error("Tick count must be 0..10000");
      if(ticks)machine.Call("Pause",{false});
      for(int i=0;i<ticks;i++)state=machine.Call("Tick",{16000000});
      const auto image=machine.Image().convertToFormat(QImage::Format_RGBA8888);auto result=state.toObject();
      result["rgbaSha256"]=QString::fromLatin1(QCryptographicHash::hash(QByteArray(reinterpret_cast<const char *>(image.constBits()),image.sizeInBytes()),QCryptographicHash::Sha256).toHex());
      printf("%s\n",QJsonDocument(result).toJson(QJsonDocument::Compact).constData());
      return result["fault"].toString().isEmpty()?0:1;
    } catch(const std::exception &error){fprintf(stderr,"%s\n",error.what());return 1;}
  }
  qmlRegisterType<Screen>("HemuNative",1,0,"HemuScreen");Backend backend;
  QQmlApplicationEngine qml;qml.rootContext()->setContextProperty("backend",&backend);
  qml.load(QUrl("qrc:/hemu/Main.qml"));if(qml.rootObjects().isEmpty())return 1;
  auto *window=qobject_cast<QQuickWindow *>(qml.rootObjects().first());backend.Attach(window);
  if(argc>1)backend.open(QString::fromLocal8Bit(argv[1]));
  return app.exec();
} catch(const std::exception &error) {
  fprintf(stderr,"%s\n",error.what());return 1;
}
