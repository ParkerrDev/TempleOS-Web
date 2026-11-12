#include "../../../engine/native/App.hpp"
#include "../pointer/Commands.hpp"
#include <QDir>

static void Settle(Machine &machine,const QString &source) {
  const auto id=machine.Call("Exec",{source});
  for(int i=0;i<2000;i++) {
    machine.Call("Tick",{16000000});const auto state=machine.Call("Job",{id}).toObject();
    if(state["state"]=="done")return;
    if(state["state"]=="failed")throw std::runtime_error(QJsonDocument(state).toJson().toStdString());
  }
  throw std::runtime_error("Audio fixture did not finish");
}
int main(int argc,char **argv) {
  QGuiApplication app(argc,argv);app.setApplicationName("hemu-audio-test");
  try {
    if(argc==5&&QString::fromLocal8Bit(argv[1])=="prepare") {
      QFile source(QString::fromLocal8Bit(argv[4]));
      if(!source.open(QIODevice::ReadOnly))throw std::runtime_error("Missing native audio source");
      std::atomic<bool> cancel{false};Machine machine(&cancel);
      machine.Call("Open",{QString::fromLocal8Bit(argv[2])});
      const bool timed=machine.Call("Audio").toObject()["timed"].toBool();machine.Call("Pause",{false});
      Settle(machine,QString::fromLatin1(source.readAll()));
      machine.Call("Pause",{true});machine.Call("Save",{QString::fromLocal8Bit(argv[3])});
      Reply({{"event","prepared"},{"timed",timed}});return 0;
    }
    const auto device=QMediaDevices::defaultAudioOutput();
    if(device.isNull()||device.description()!="HEMU Test")throw std::runtime_error("Use the isolated HEMU test audio server");
    if(argc==2&&QString::fromLocal8Bit(argv[1])=="mixer") {
      Tone tone;QAudioFormat format;format.setSampleRate(48000);format.setChannelCount(1);format.setSampleFormat(QAudioFormat::Float);
      if(!device.isFormatSupported(format))throw std::runtime_error("Test output lacks mono float PCM");
      QAudioSink sink(device,format);sink.setBufferSize(7680);sink.start(&tone);
      Commands commands([&](const QJsonObject &message){
        const auto op=message["cmd"].toString();
        if(op=="start")tone.Start();
        else if(op=="packet")tone.Submit(message["packet"].toObject());
        else if(op=="stop"){tone.Stop();sink.reset();sink.start(&tone);}
        else if(op=="quit")app.quit();
        Reply({{"event","command"},{"cmd",op},{"state",tone.Status()}});
      });
      Reply({{"event","ready"},{"device",device.description()}});return app.exec();
    }
    Backend backend;QJsonObject previous;
    QObject::connect(&backend,&Backend::changed,&app,[&]{
      QJsonObject state={{"event","state"},{"ready",backend.ready()},{"busy",backend.busy()},{"paused",backend.paused()},
        {"fault",backend.faulted()},{"status",backend.status()},{"path",backend.path()}};
      if(state!=previous){previous=state;Reply(state);}
    });
    Commands commands([&](const QJsonObject &message){
      const auto op=message["cmd"].toString();
      if(op=="open")backend.open(message["path"].toString());
      else if(op=="save")backend.save(message["path"].toString());
      else if(op=="pause")backend.pause();
      else if(op=="cancel")backend.cancel();
      else if(op=="quit")app.quit();
      Reply({{"event","command"},{"cmd",op}});
    });
    Reply({{"event","ready"},{"device",device.description()}});return app.exec();
  }catch(const std::exception &error){fprintf(stderr,"%s\n",error.what());return 1;}
}
