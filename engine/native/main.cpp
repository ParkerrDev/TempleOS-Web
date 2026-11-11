#include "App.hpp"
#include <QStandardPaths>

int main(int argc,char **argv) try {
  const bool check=argc>1&&QString::fromLocal8Bit(argv[1])=="check";
  if(argc==2&&(QString::fromLocal8Bit(argv[1])=="--help"||QString::fromLocal8Bit(argv[1])=="-h")) {
    puts("hemu-native [session.hemu]\nhemu-native check session.hemu [ticks]\nWithout a path, opens the packaged one-core TempleOS session.");return 0;
  }
  if(!check&&argc>2){fprintf(stderr,"Open one .hemu session at a time. Use --help for commands.\n");return 2;}
  if(check)qputenv("QT_QPA_PLATFORM","offscreen");
  QGuiApplication app(argc,argv);app.setDesktopFileName("hemu-native");
  if(check) {
    if(argc<3||argc>4){fprintf(stderr,"hemu-native check session.hemu [ticks]\n");return 2;}
    try {
      bool valid=true;const int ticks=argc>3?QString::fromLocal8Bit(argv[3]).toInt(&valid):0;
      if(!valid||ticks<0||ticks>10000)throw std::runtime_error("Tick count must be 0..10000");
      std::atomic<bool> cancel{false};Machine machine(&cancel);
      auto state=machine.Call("Open",{QString::fromLocal8Bit(argv[2])});
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
  const auto session=argc>1?QString::fromLocal8Bit(argv[1]):QStandardPaths::locate(QStandardPaths::GenericDataLocation,"hemu-native/TempleOS.hemu");
  if(!session.isEmpty())backend.open(session);
  return app.exec();
} catch(const std::exception &error) {
  fprintf(stderr,"%s\n",error.what());return 1;
}
