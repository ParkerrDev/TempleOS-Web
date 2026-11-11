#include "../../../engine/native/Files.hpp"
#include <QtTest>
#include <QDBusVirtualObject>
#include <QDBusArgument>
#include <QTimer>

#include "Portal.hpp"

class FileTest:public QObject {
  Q_OBJECT
  Portal portal;
private slots:
  void initTestCase(){QVERIFY(portal.bus.isConnected());QVERIFY(portal.bus.registerService("org.freedesktop.portal.Desktop"));QVERIFY(portal.bus.registerVirtualObject("/org/freedesktop/portal/desktop",&portal,QDBusConnection::SubPath));}
  void init(){portal.delay=0;portal.early=portal.wrongHandle=portal.fail=false;portal.closed.clear();}
  void openAndSave() {
    Files files;QSignalSpy chosen(&files,&Files::selected),errors(&files,&Files::error);
    for(bool save:{false,true}) {
      const auto calls=portal.calls;files.Choose(save,"/tmp/original name.hemu");QVERIFY(files.Pending());
      QTRY_COMPARE(portal.calls,calls+1);QCOMPARE(portal.method,save?QString("SaveFile"):QString("OpenFile"));
      QCOMPARE(portal.options["modal"].toBool(),true);QCOMPARE(portal.options["multiple"].toBool(),false);
      QVERIFY(portal.options["handle_token"].toString().startsWith("hemu_"));
      if(save)QCOMPARE(portal.options["current_name"].toString(),QString("original name.hemu"));
      portal.Response(portal.handle,0,{"file:///tmp/a%20b.hemu"});QTRY_COMPARE(chosen.count(),save?2:1);
      QCOMPARE(chosen.last()[0].toString(),QString("/tmp/a b.hemu"));QCOMPARE(chosen.last()[1].toBool(),save);QVERIFY(!files.Pending());
    }
    auto calls=portal.calls;files.Choose(false,{});QTRY_COMPARE(portal.calls,calls+1);
    portal.Response(portal.handle,0,{"file://localhost/tmp/local.hemu"});QTRY_COMPARE(chosen.count(),3);
    QCOMPARE(chosen.last()[0].toString(),QString("/tmp/local.hemu"));QCOMPARE(errors.count(),0);
  }
  void responseBeforeReply() {
    Files files;QSignalSpy chosen(&files,&Files::selected),errors(&files,&Files::error);portal.early=true;portal.delay=50;
    const auto replies=portal.replies;files.Choose(false,{});QTRY_COMPARE(chosen.count(),1);QVERIFY(!files.Pending());
    QTRY_COMPARE(portal.replies,replies+1);QCOMPARE(errors.count(),0);
  }
  void cancellationAndSuccessor() {
    Files files;QSignalSpy chosen(&files,&Files::selected),errors(&files,&Files::error);portal.delay=100;portal.wrongHandle=true;
    auto calls=portal.calls;const auto replies=portal.replies;files.Choose(false,{});QTRY_COMPARE(portal.calls,calls+1);
    const auto first=portal.handle;files.Cancel();QVERIFY(!files.Pending());
    portal.delay=0;portal.wrongHandle=false;files.Choose(true,{});QTRY_COMPARE(portal.calls,calls+2);const auto second=portal.handle;QVERIFY(first!=second);
    QTRY_COMPARE(portal.replies,replies+2);QTRY_VERIFY(portal.closed.contains(first+"_different"));QVERIFY(portal.closed.contains(first));QVERIFY(files.Pending());QVERIFY(!portal.closed.contains(second));
    portal.Response(first,0,{"file:///tmp/old.hemu"});portal.Response(second,0,{"file:///tmp/new.hemu"});
    QTRY_COMPARE(chosen.count(),1);QCOMPARE(chosen[0][0].toString(),QString("/tmp/new.hemu"));QCOMPARE(errors.count(),0);
  }
  void refusals() {
    Files files;QSignalSpy chosen(&files,&Files::selected),errors(&files,&Files::error);
    for(const auto &uris:{QStringList{"https://example.invalid/a.hemu"},QStringList{"file://remote/tmp/a.hemu"},QStringList{"file:///tmp/a%00b.hemu"},QStringList{"file:///tmp/a.hemu","file:///tmp/b.hemu"}}) {
      const auto calls=portal.calls;const auto n=errors.count();files.Choose(false,{});QTRY_COMPARE(portal.calls,calls+1);
      portal.Response(portal.handle,0,uris);QTRY_COMPARE(errors.count(),n+1);QVERIFY(!files.Pending());
    }
    auto calls=portal.calls;files.Choose(false,{});QTRY_COMPARE(portal.calls,calls+1);portal.Response(portal.handle,1,{});
    QTRY_VERIFY(!files.Pending());QCOMPARE(errors.count(),4);QCOMPARE(chosen.count(),0);
    portal.wrongHandle=true;files.Choose(false,{});QTRY_COMPARE(errors.count(),5);QTRY_VERIFY(portal.closed.contains(portal.handle+"_different"));
    portal.wrongHandle=false;portal.fail=true;files.Choose(false,{});QTRY_COMPARE(errors.count(),6);QVERIFY(errors.last()[0].toString().contains("fixture failure"));
  }
  void portalExit() {
    Files files;QSignalSpy errors(&files,&Files::error);const auto calls=portal.calls;
    files.Choose(false,{});QTRY_COMPARE(portal.calls,calls+1);QVERIFY(files.Pending());
    QVERIFY(portal.bus.unregisterService("org.freedesktop.portal.Desktop"));
    QTRY_COMPARE(errors.count(),1);QVERIFY(!files.Pending());
    QVERIFY(errors.first()[0].toString().contains("closed before completing"));
    QVERIFY(portal.bus.registerService("org.freedesktop.portal.Desktop"));
  }
};
QTEST_GUILESS_MAIN(FileTest)
#include "files.moc"
