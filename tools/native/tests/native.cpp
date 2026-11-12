#include "../../../engine/native/App.hpp"
#include <QtTest>
#include "Portal.hpp"
#include <QTemporaryDir>
#include <QSignalSpy>
#include <condition_variable>
#include <future>
#include <mutex>

class NativeTest:public QObject {
  Q_OBJECT
  QString input;
  QByteArray pixels(const QImage &image) {
    const auto rgba=image.convertToFormat(QImage::Format_RGBA8888);
    return QByteArray(reinterpret_cast<const char *>(rgba.constBits()),rgba.sizeInBytes());
  }
private slots:
  void initTestCase(){
    const auto rejected=std::async(std::launch::async,[]{try{JsInit();return false;}catch(const std::runtime_error &error){return QString::fromUtf8(error.what()).contains("application thread");}}).get();
    QVERIFY(rejected);JsInit();
    QVERIFY(std::async(std::launch::async,[]{JsInit();return true;}).get());
    input=qEnvironmentVariable("HEMU_NATIVE_FIXTURE");QVERIFY2(!input.isEmpty(),"Set HEMU_NATIVE_FIXTURE to a complete one-core saved session");
  }
  void cancellation() {
    QTemporaryDir dir;QVERIFY(dir.isValid());const auto output=dir.filePath("keep.hemu");
    QFile old(output);QVERIFY(old.open(QIODevice::WriteOnly));old.write("previous session");old.close();
    for(const auto *operation:{"read","write"}) {
      std::atomic<bool> cancel{false};std::mutex mutex;std::condition_variable condition;bool entered=false,release=false;
      auto work=std::async(std::launch::async,[&](){
        try {
          bool armed=QString::fromLatin1(operation)=="read";
          Machine machine(&cancel,[&](const char *mode,size_t){
            if(!armed||strcmp(mode,operation))return;
            std::unique_lock lock(mutex);entered=true;condition.notify_all();condition.wait(lock,[&]{return release;});
          });
          machine.Call("Open",{input});armed=true;machine.Call("Save",{output});return QString("unexpected success");
        }catch(const std::exception &error){return QString::fromUtf8(error.what());}
      });
      {
        std::unique_lock lock(mutex);
        const bool reached=condition.wait_for(lock,std::chrono::seconds(30),[&]{return entered;});
        cancel.store(true);release=true;condition.notify_all();QVERIFY(reached);
      }
      QVERIFY(work.get().contains("Operation cancelled"));
      QVERIFY(old.open(QIODevice::ReadOnly));QCOMPARE(old.readAll(),QByteArray("previous session"));old.close();
      QCOMPARE(QDir(dir.path()).entryList(QDir::Files|QDir::Hidden),QStringList{"keep.hemu"});
    }
  }
  void session() {
    QTemporaryDir dir;QVERIFY(dir.isValid());std::atomic<bool> cancel{false};Machine original(&cancel);
    auto initial=original.Call("Open",{input}).toObject();QCOMPARE(initial["cores"].toInt(),1);QVERIFY(initial["fault"].toString().isEmpty());
    original.Call("Pause",{true});const auto before=pixels(original.Image());
    original.Call("Tick",{16000000});QCOMPARE(pixels(original.Image()),before);
    const auto saved=dir.filePath("saved.hemu");original.Call("Save",{saved});
    Machine restored(&cancel);const auto status=restored.Call("Open",{saved}).toObject();
    QVERIFY(status["paused"].toBool());QCOMPARE(pixels(restored.Image()),before);
    restored.Call("Pause",{false});const auto job=restored.Call("Exec",{"FileWrite(\"C:/Home/NativeCheck.TXT\",\"JSC\",3);"});
    bool done=false;
    for(int i=0;i<2000;i++) {
      restored.Call("Tick",{16000000});const auto state=restored.Call("Job",{job}).toObject();
      if(state["state"].toString()=="done"){done=true;break;}
      QVERIFY2(state["state"].toString()!="failed",QJsonDocument(state).toJson().constData());
    }
    QVERIFY(done);restored.Call("Pause",{true});restored.Call("Save",{saved});
    Machine disk(&cancel);disk.Call("Open",{saved});disk.Call("Pause",{false});
    const auto read=disk.Call("Exec",{"I64 n;U8 *p=FileRead(\"C:/Home/NativeCheck.TXT\",&n);if (!p || n!=3 || MemCmp(p,\"JSC\",3)) throw('Native');Free(p);"});done=false;
    for(int i=0;i<2000;i++){disk.Call("Tick",{16000000});if(disk.Call("Job",{read}).toObject()["state"].toString()=="done"){done=true;break;}}
    QVERIFY(done);
  }
  void settings() {
    std::atomic<bool> cancel{false};Machine machine(&cancel);const auto imported=machine.Call("Open",{input}).toObject();
    machine.Call("Pause",{true});
    const auto initial=machine.Call("Status").toObject();
    QCOMPARE(initial["rate"],imported["rate"]);QCOMPARE(initial["repeat"],imported["repeat"]);
    QVERIFY_THROWS_EXCEPTION(std::runtime_error,machine.Call("Settings",{QJsonObject{{"rate",59},{"repeat",true}}}));
    QVERIFY_THROWS_EXCEPTION(std::runtime_error,machine.Call("Settings",{QJsonObject{{"rate",60},{"repeat",1}}}));
    QCOMPARE(machine.Call("Status").toObject(),initial);
    auto settle=[&](const QString &source) {
      const auto id=machine.Call("Exec",{source});
      for(int i=0;i<1000;i++) {
        machine.Call("Tick",{16000000});const auto job=machine.Call("Job",{id}).toObject();
        if(job["state"].toString()=="done")return true;
        if(job["state"].toString()=="failed"){qWarning()<<job;return false;}
      }
      return false;
    };
    const QStringList periods={"3F91111111111111","3F81111111111111","3F50624DD2F1A9FC","3FA1156F8C384072"};int index=0;
    for(int rate:{60,120,0,30}) {
      machine.Call("Pause",{true});const auto still=pixels(machine.Image());
      const auto state=machine.Call("Settings",{QJsonObject{{"rate",rate},{"repeat",false}}}).toObject();
      QVERIFY(state["ok"].toBool());QCOMPARE(state["rate"].toInt(),rate);QCOMPARE(state["actualRate"].toInt(),rate);QVERIFY(!state["repeat"].toBool());
      QCOMPARE(pixels(machine.Image()),still);machine.Call("Pause",{false});
      QVERIFY(settle(QString("Bool native_rate_found=FALSE;I64 native_i;for(native_i=0;native_i<4096;native_i++)if(*((&WinMgrSleep)(U8*)+native_i)(U64*)==0x%1)native_rate_found=TRUE;if(!native_rate_found)throw('Rate');").arg(periods[index++])));
    }
    for(bool repeat:{false,true}) {
      machine.Call("Settings",{QJsonObject{{"rate",30},{"repeat",repeat}}});
      QVERIFY(settle("I64 native_key_start=kbd.cnt;"));machine.Call("Key",{0x1E,true});
      for(int i=0;i<80;i++)machine.Call("Tick",{16000000});
      QVERIFY(settle(repeat?"if(kbd.cnt-native_key_start<20)throw('Repeat');":"if(kbd.cnt-native_key_start!=1)throw('Repeat');"));
      machine.Call("Release");for(int i=0;i<10;i++)machine.Call("Tick",{16000000});
    }
    machine.Call("Settings",{QJsonObject{{"rate",120},{"repeat",true}}});machine.Call("Pause",{true});
    const auto before=pixels(machine.Image());QTemporaryDir dir;QVERIFY(dir.isValid());const auto saved=dir.filePath("settings.hemu");
    machine.Call("Save",{saved});Machine restored(&cancel);const auto state=restored.Call("Open",{saved}).toObject();
    QCOMPARE(state["rate"].toInt(),120);QCOMPARE(state["actualRate"].toInt(),120);QVERIFY(state["repeat"].toBool());QVERIFY(state["paused"].toBool());
    QCOMPARE(pixels(restored.Image()),before);
  }
  void clockBacklog() {
    std::atomic<bool> cancel{false};Machine machine(&cancel);machine.Call("Open",{input});machine.Call("Pause",{false});
    auto settle=[&](const QString &source) {
      const auto id=machine.Call("Exec",{source});
      for(int i=0;i<1000;i++) {
        machine.Call("Tick",{16000000});const auto job=machine.Call("Job",{id}).toObject();
        if(job["state"].toString()=="done")return true;
        if(job["state"].toString()=="failed"){qWarning()<<job;return false;}
      }
      return false;
    };
    QVERIFY(settle("I64 native_clock_start=GetTSC;"));
    machine.Call("Tick",{900000000});
    for(int i=0;i<8;i++)machine.Call("Tick",{0});
    QVERIFY(settle("if(GetTSC-native_clock_start<900000000 || GetTSC-native_clock_start>1100000000)throw('Clock',TRUE);"));
    machine.Call("Tick",{900000000});machine.Call("Pause",{true});machine.Call("Tick",{900000000});machine.Call("Pause",{false});
    QVERIFY(settle("native_clock_start=GetTSC;"));
    for(int i=0;i<8;i++)machine.Call("Tick",{0});
    QVERIFY(settle("if(GetTSC-native_clock_start>100000000)throw('Pause',TRUE);"));
    machine.Call("Tick",{900000000});
    QTemporaryDir dir;QVERIFY(dir.isValid());machine.Call("Save",{dir.filePath("clock.hemu")});
    QVERIFY(settle("native_clock_start=GetTSC;"));
    for(int i=0;i<8;i++)machine.Call("Tick",{0});
    QVERIFY(settle("if(GetTSC-native_clock_start>100000000)throw('Save',TRUE);"));
  }
  void audioPackets() {
    std::atomic<bool> cancel{false};Machine machine(&cancel);machine.Call("Open",{input});
    const bool timed=machine.Call("Audio").toObject()["timed"].toBool();
    Tone speaker;speaker.Start();machine.Call("Pause",{false});
    const auto id=machine.Call("Exec",{QString(
      "I64 native_audio_i,native_audio_at=cnts.jiffies,native_audio_div;"
      "OutU8(0x43,0xB6);OutU8(0x42,3000&255);OutU8(0x42,3000>>8);OutU8(0x61,3);"
      "for(native_audio_i=0;native_audio_i<140;native_audio_i++){"
      "SleepUntil(native_audio_at+native_audio_i*JIFFY_FREQ/140);native_audio_div=3000;if(native_audio_i&1)native_audio_div=1500;"
      "OutU8(0x42,native_audio_div&255);OutU8(0x42,native_audio_div>>8);}Snd(0);")});
    QJsonArray events;bool done=false;int audible=0;quint64 first=0,last=0;
    for(int i=0;i<1000;i++) {
      machine.Call("Tick",{16000000});const auto packet=machine.Call("Audio").toObject();
      QCOMPARE(packet["timed"].toBool(),timed);QVERIFY(packet["error"].toString().isEmpty());
      for(const auto &event:packet["events"].toArray())if(event.toArray()[0].toDouble()>0)events.append(event);
      speaker.Submit(packet);std::array<float,768> pcm{};
      speaker.readData(reinterpret_cast<char *>(pcm.data()),sizeof(pcm));
      for(float value:pcm)if(value)audible++;
      const auto job=machine.Call("Job",{id}).toObject();
      if(job["state"].toString()=="done"){done=true;break;}
      QVERIFY2(job["state"].toString()!="failed",QJsonDocument(job).toJson().constData());
    }
    QVERIFY(done);QVERIFY(audible>30000);QVERIFY(speaker.Status()["error"].toString().isEmpty());
    if(timed) {
      QVERIFY(events.size()>=140);
      const int start=events.size()-140;
      for(int i=0;i<140;i++) {
        const auto event=events[start+i].toArray();
        QCOMPARE(event[0].toDouble(),1193182.0/(i&1?1500:3000));
        const auto ns=event[1].toString().toULongLong();if(!i)first=ns;
        QVERIFY(ns>=last);last=ns;
      }
      QVERIFY(last-first>980000000&&last-first<1010000000);
      qInfo()<<"Timed native speaker:"<<events.size()<<"transitions,"<<last-first<<"ns,"<<audible<<"nonzero PCM samples";
    } else {QVERIFY(events.isEmpty());qInfo()<<"Legacy saved engine remains explicitly untimed";}
    machine.Call("Pause",{true});speaker.Stop();std::array<float,4800> pcm{};
    speaker.readData(reinterpret_cast<char *>(pcm.data()),sizeof(pcm));
    QVERIFY(std::all_of(pcm.begin(),pcm.end(),[](float value){return value==0;}));
    QVERIFY(machine.Call("Audio").toObject()["events"].toArray().isEmpty());
  }
  void timerLifecycle() {
    std::atomic<bool> cancel{false};FrameMailbox mailbox;Engine engine(&cancel,&mailbox);
    auto *timer=engine.findChild<QTimer *>();QVERIFY(timer);QVERIFY(!timer->isActive());
    engine.Open(input);engine.Pause(true);QVERIFY(!timer->isActive());
    engine.Pause(false);QVERIFY(timer->isActive());engine.Pause(true);QVERIFY(!timer->isActive());
    QTemporaryDir dir;QVERIFY(dir.isValid());const auto saved=dir.filePath("running.hemu");
    engine.Save(saved);QVERIFY(!timer->isActive());engine.Open(saved);QVERIFY(!timer->isActive());
    engine.Pause(false);engine.Save(saved);QVERIFY(timer->isActive());
    engine.Open(dir.filePath("missing.hemu"));QVERIFY(!timer->isActive());
    engine.Open(saved);QVERIFY(timer->isActive());engine.Pause(true);QVERIFY(!timer->isActive());
    Machine fault(&cancel);fault.Call("Open",{input});fault.Call("Pause",{false});
    const auto id=fault.Call("Exec",{"U0 IdleFault() {Sleep(200);asm {DU8 0xD9,0xD1;}}Spawn(&IdleFault);"});
    bool done=false;
    for(int i=0;i<1000;i++) {
      fault.Call("Tick",{1000000});const auto job=fault.Call("Job",{id}).toObject();
      if(job["state"].toString()=="done"){done=true;break;}
      QVERIFY2(job["state"].toString()!="failed",QJsonDocument(job).toJson().constData());
    }
    QVERIFY(done);fault.Call("Pause",{true});const auto pending=dir.filePath("pending.hemu");fault.Call("Save",{pending});
    engine.Open(pending);QVERIFY(!timer->isActive());engine.Pause(false);QVERIFY(timer->isActive());
    QSignalSpy states(&engine,&Engine::stateChanged);QTRY_VERIFY_WITH_TIMEOUT(!timer->isActive(),10000);
    QVERIFY(!states.isEmpty());const auto stopped=qvariant_cast<QJsonObject>(states.last()[0]);
    QVERIFY(stopped["paused"].toBool());QVERIFY(stopped["fault"].toString().contains("CPU 0 stopped"));
  }
  void inputAndFault() {
    std::atomic<bool> cancel{false};Machine machine(&cancel);machine.Call("Open",{input});machine.Call("Pause",{false});
    auto settle=[&](const QString &source) {
      const auto id=machine.Call("Exec",{source});
      for(int i=0;i<1000;i++) {
        machine.Call("Tick",{16000000});const auto state=machine.Call("Job",{id}).toObject();
        if(state["state"].toString()=="done")return true;
        if(state["state"].toString()=="failed")return false;
      }
      return false;
    };
    machine.Call("Key",{0x1E,true});for(int i=0;i<30;i++)machine.Call("Tick",{16000000});
    QVERIFY(settle("if (!Bt(kbd.down_bitmap,0x1E)) throw('KeyDown');"));
    machine.Call("Release");for(int i=0;i<30;i++)machine.Call("Tick",{16000000});
    QVERIFY(settle("if (Bt(kbd.down_bitmap,0x1E)) throw('KeyUp');"));
    machine.Call("Exec",{"U0 NativeFault() {Sleep(200);asm {DU8 0xD9,0xD1;}}Spawn(&NativeFault);"});
    QJsonObject state;
    for(int i=0;i<1000;i++){state=machine.Call("Tick",{16000000}).toObject();if(!state["fault"].toString().isEmpty())break;}
    QVERIFY(state["fault"].toString().contains("CPU 0 stopped"));QVERIFY(state["paused"].toBool());
    const auto before=pixels(machine.Image());machine.Call("Tick",{16000000});QCOMPARE(pixels(machine.Image()),before);
    QVERIFY_THROWS_EXCEPTION(std::runtime_error,machine.Call("Pause",{false}));
    QTemporaryDir dir;QVERIFY(dir.isValid());const auto saved=dir.filePath("faulted.hemu");
    machine.Call("Save",{saved});Backend backend;backend.open(saved);
    QTRY_VERIFY_WITH_TIMEOUT(!backend.busy(),30000);QVERIFY(backend.ready());
    QVERIFY(backend.faulted());QVERIFY(backend.paused());
    QCOMPARE(backend.status(),state["fault"].toString());
    QCOMPARE(pixels(backend.image()),before);
  }
  void fileSelection() {
    Portal portal;QVERIFY(portal.bus.isConnected());
    QVERIFY(portal.bus.registerService("org.freedesktop.portal.Desktop"));
    QVERIFY(portal.bus.registerVirtualObject("/org/freedesktop/portal/desktop",&portal,QDBusConnection::SubPath));
    qmlRegisterType<Screen>("HemuNative",1,0,"HemuScreen");Backend backend;
    QQmlApplicationEngine qml;qml.rootContext()->setContextProperty("backend",&backend);qml.load(QUrl("qrc:/hemu/Main.qml"));
    QVERIFY(!qml.rootObjects().isEmpty());auto *window=qobject_cast<QQuickWindow *>(qml.rootObjects().first());QVERIFY(window);
    backend.Attach(window);auto *open=window->findChild<QQuickItem *>("openFile"),*save=window->findChild<QQuickItem *>("saveFile");QVERIFY(open);QVERIFY(save);
    QSignalSpy keys(&backend,&Backend::keyRequested),released(&backend,&Backend::releaseRequested);
    QVERIFY(QMetaObject::invokeMethod(open,"clicked"));QTRY_COMPARE(portal.calls,1);QVERIFY(backend.busy());QVERIFY(!released.isEmpty());
    portal.Response(portal.handle,0,{QUrl::fromLocalFile(input).toString()});
    QTRY_VERIFY_WITH_TIMEOUT(backend.ready()&&!backend.busy(),30000);QCOMPARE(backend.path(),input);
    QTemporaryDir dir;QVERIFY(dir.isValid());const auto saved=dir.filePath("chosen session.hemu");
    QVERIFY(QMetaObject::invokeMethod(save,"clicked"));QTRY_COMPARE(portal.calls,2);QCOMPARE(portal.method,QString("SaveFile"));
    QCOMPARE(portal.options["current_name"].toString(),QFileInfo(input).fileName());
    portal.Response(portal.handle,0,{QUrl::fromLocalFile(saved).toString()});
    QTRY_VERIFY_WITH_TIMEOUT(!backend.busy(),30000);QVERIFY(QFile::exists(saved));QCOMPARE(backend.path(),saved);
    QVERIFY(QMetaObject::invokeMethod(open,"clicked"));QTRY_COMPARE(portal.calls,3);
    portal.Response(portal.handle,0,{QUrl::fromLocalFile(input).toString()});QTRY_VERIFY(!backend.busy());
    auto *replace=window->findChild<QObject *>("replaceDialog");QVERIFY(replace);QTRY_VERIFY(replace->property("visible").toBool());
    QCOMPARE(backend.path(),saved);QVERIFY(QMetaObject::invokeMethod(replace,"reject"));QTRY_VERIFY(!replace->property("visible").toBool());QCOMPARE(backend.path(),saved);
    QVERIFY(QMetaObject::invokeMethod(open,"clicked"));QTRY_COMPARE(portal.calls,4);backend.cancel();QTRY_VERIFY(!backend.busy());
    QCOMPARE(backend.path(),saved);QVERIFY(backend.status().contains("cancelled"));QCOMPARE(keys.count(),0);
    portal.bus.unregisterObject("/org/freedesktop/portal/desktop",QDBusConnection::UnregisterTree);
    portal.bus.unregisterService("org.freedesktop.portal.Desktop");
  }
  void gui() {
    qmlRegisterType<Screen>("HemuNative",1,0,"HemuScreen");Backend backend;
    QQmlApplicationEngine qml;qml.rootContext()->setContextProperty("backend",&backend);qml.load(QUrl("qrc:/hemu/Main.qml"));
    QVERIFY(!qml.rootObjects().isEmpty());auto *window=qobject_cast<QQuickWindow *>(qml.rootObjects().first());QVERIFY(window);
    backend.Attach(window);QSignalSpy changes(&backend,&Backend::changed);QSignalSpy keys(&backend,&Backend::keyRequested);
    backend.open(input);QTRY_VERIFY_WITH_TIMEOUT(!backend.busy(),30000);QVERIFY(backend.ready());
    const auto before=pixels(backend.image());QVERIFY(before.size()==640*480*4);
    auto *screen=window->findChild<QQuickItem *>("screen");QVERIFY(screen);screen->forceActiveFocus();
    QTest::keyPress(window,Qt::Key_Control);QTest::keyPress(window,Qt::Key_M);
    QTest::keyRelease(window,Qt::Key_M);QTest::keyRelease(window,Qt::Key_Control);
    QCOMPARE(keys.count(),4);QCOMPARE(keys[0][0].toInt(),0x1D);QCOMPARE(keys[1][0].toInt(),0x32);
    const bool oldPause=backend.paused();backend.pause();QTRY_VERIFY_WITH_TIMEOUT(backend.paused()!=oldPause,3000);
    if(!backend.paused()){backend.pause();QTRY_VERIFY_WITH_TIMEOUT(backend.paused(),3000);}
    const auto paused=pixels(backend.image());QTest::qWait(50);QCOMPARE(pixels(backend.image()),paused);
    auto *rate=window->findChild<QQuickItem *>("rate"),*repeat=window->findChild<QQuickItem *>("repeat");QVERIFY(rate);QVERIFY(repeat);
    rate->setProperty("currentIndex",0);QVERIFY(QMetaObject::invokeMethod(rate,"activated",Q_ARG(int,0)));QVERIFY(backend.busy());QTRY_VERIFY(!backend.busy());QCOMPARE(backend.rate(),0);QVERIFY(backend.rateKnown());
    const auto wasRepeat=backend.repeat();QTest::mouseClick(window,Qt::LeftButton,Qt::NoModifier,repeat->mapToScene(QPointF(repeat->width()/2,repeat->height()/2)).toPoint());
    QTRY_VERIFY(!backend.busy());QCOMPARE(backend.repeat(),!wasRepeat);QCOMPARE(pixels(backend.image()),paused);
    QTemporaryDir dir;QVERIFY(dir.isValid());QFile bad(dir.filePath("bad.hemu"));QVERIFY(bad.open(QIODevice::WriteOnly));bad.write("invalid");bad.close();
    backend.open(bad.fileName());QTRY_VERIFY_WITH_TIMEOUT(!backend.busy(),30000);QVERIFY(backend.ready());QVERIFY(backend.paused());
    QCOMPARE(pixels(backend.image()),paused);QCOMPARE(backend.path(),input);
    backend.open(input);backend.cancel();QTRY_VERIFY_WITH_TIMEOUT(!backend.busy(),30000);
    QVERIFY(backend.status().contains("cancelled"));QCOMPARE(pixels(backend.image()),paused);
    const auto saved=dir.filePath("gui.hemu");backend.save(saved);QTRY_VERIFY_WITH_TIMEOUT(!backend.busy(),30000);QVERIFY(QFile::exists(saved));
    backend.open(saved);QTRY_VERIFY_WITH_TIMEOUT(!backend.busy(),30000);QCOMPARE(pixels(backend.image()),paused);
    QVERIFY(window->grabWindow().save(qEnvironmentVariable("HEMU_NATIVE_SCREENSHOT","/tmp/hemu-native-window.png")));
  }
};
QTEST_MAIN(NativeTest)
#include "native.moc"
