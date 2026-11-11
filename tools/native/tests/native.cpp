#include "../../../engine/native/App.hpp"
#include <QtTest>
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
