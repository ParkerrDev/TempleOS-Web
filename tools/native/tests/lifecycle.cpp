#include "../../../engine/native/App.hpp"
#include <QTemporaryDir>

int main(int argc,char **argv) {
  QGuiApplication app(argc,argv);QTemporaryDir directory;
  if(!directory.isValid())return 2;
  const auto input=qEnvironmentVariable("HEMU_NATIVE_FIXTURE"),saved=directory.filePath("saved.hemu");
  if(input.isEmpty())return 2;
  Backend backend;bool started=false,saveDone=false,pauseDone=false,resumeDone=false,replaceDone=false;
  int images=0;QElapsedTimer clock;QTimer deadline;
  QObject::connect(&backend,&Backend::imageChanged,&app,[&]{images++;});
  QObject::connect(&backend,&Backend::changed,&app,[&]{
    if(!backend.ready()||backend.busy())return;
    if(!started){started=true;clock.start();if(backend.paused())backend.pause();}
    if(backend.status().startsWith("Saved "))saveDone=true;
    if(saveDone&&backend.paused())pauseDone=true;
    if(pauseDone&&!backend.paused())resumeDone=true;
    if(backend.path()==saved)replaceDone=true;
  });
  bool saveSent=false,pauseSent=false,resumeSent=false,replaceSent=false;
  deadline.setInterval(100);
  QObject::connect(&deadline,&QTimer::timeout,&app,[&]{
    if(!started)return;
    const auto elapsed=clock.elapsed();
    if(backend.faulted()){fprintf(stderr,"%s\n",backend.status().toUtf8().constData());app.exit(1);return;}
    if(elapsed>=5000&&!saveSent){saveSent=true;backend.save(saved);}
    if(saveDone&&elapsed>=12000&&!pauseSent){pauseSent=true;backend.pause();}
    if(pauseDone&&elapsed>=13000&&!resumeSent){resumeSent=true;backend.pause();}
    if(resumeDone&&elapsed>=20000&&!replaceSent){replaceSent=true;backend.open(saved);}
    if(elapsed>=45000) {
      const bool ok=saveDone&&pauseDone&&resumeDone&&replaceDone&&!backend.busy()&&images>10;
      printf("{\"saved\":%s,\"paused\":%s,\"resumed\":%s,\"replaced\":%s,\"images\":%d,\"elapsedMs\":%lld}\n",
        saveDone?"true":"false",pauseDone?"true":"false",resumeDone?"true":"false",replaceDone?"true":"false",images,elapsed);
      app.exit(ok?0:1);
    }
  });
  QTimer::singleShot(60000,&app,[&]{fprintf(stderr,"Native lifecycle exceeded its bound\n");app.exit(1);});
  deadline.start();backend.open(input);return app.exec();
}
