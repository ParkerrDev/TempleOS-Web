#include "../../../engine/native/Speaker.hpp"
#include <QtTest>
#include <vector>

class SpeakerTest:public QObject {
  Q_OBJECT
  static QJsonArray Event(double hz,quint64 ns){return {hz,QString::number(ns)};}
  static QJsonObject Packet(double hz,quint64 end,QJsonArray events={}) {
    return {{"timed",true},{"frequency",hz},{"end",QString::number(end)},{"events",events},{"error",""}};
  }
  static std::vector<float> Read(Tone &tone,int frames) {
    std::vector<float> result(frames);
    if(tone.readData(reinterpret_cast<char *>(result.data()),frames*sizeof(float))!=qint64(frames*sizeof(float)))throw std::runtime_error("PCM length");
    return result;
  }
  static bool Silent(const std::vector<float> &pcm){return std::all_of(pcm.begin(),pcm.end(),[](float value){return value==0;});}
private slots:
  void cadence() {
    Tone tone;tone.Start();constexpr quint64 base=0x8000000000000001ULL;
    QJsonArray events;std::vector<std::pair<int,double>> changes;
    for(int i=0;i<42;i++) {
      const quint64 ns=quint64(i)*1000000000/140;const double hz=i%3==2?0:i%3?1920:960;
      events.append(Event(hz,base+ns));changes.emplace_back(ns*48000/1000000000,hz);
    }
    tone.Submit(Packet(0,base+300000000,events));
    QCOMPARE(tone.Status()["error"].toString(),QString());
    const auto pcm=Read(tone,14400);double phase=0,hz=0;size_t index=0;int silent=0;
    for(int i=0;i<int(pcm.size());i++) {
      while(index<changes.size()&&changes[index].first<=i)hz=changes[index++].second;
      QCOMPARE(pcm[i],hz?(phase<0.5?0.04f:-0.04f):0.0f);
      phase+=hz/48000;phase-=std::floor(phase);if(!pcm[i])silent++;
    }
    QVERIFY(silent>4700&&silent<4900);QCOMPARE(tone.Status()["underruns"].toInt(),0);
  }
  void lifecycle() {
    Tone tone;tone.Start();tone.Submit(Packet(960,100000000,{Event(960,0)}));
    QVERIFY(!Silent(Read(tone,100)));
    tone.Stop();QVERIFY(Silent(Read(tone,5000)));
    tone.Submit(Packet(1920,200000000,{Event(1920,100000000)}));QVERIFY(Silent(Read(tone,5000)));
    tone.Start();tone.Submit(Packet(0,300000000));QVERIFY(Silent(Read(tone,5000)));
    tone.Submit(Packet(960,400000000,{Event(960,300000000)}));QVERIFY(!Silent(Read(tone,4800)));
    tone.Stop();tone.Start();tone.Submit({{"timed",false},{"frequency",440}});
    QVERIFY(!Silent(Read(tone,4800)));QVERIFY(!tone.Status()["timed"].toBool());
    tone.Stop();QVERIFY(Silent(Read(tone,4800)));
  }
  void deviceBuffer() {
    Tone tone;tone.Start();tone.Submit({{"timed",false},{"frequency",440}});
    QCOMPARE(tone.read(4).size(),4);
    tone.Stop();const auto after=tone.read(4096);
    QCOMPARE(after,QByteArray(4096,0));
  }
  void bounds() {
    Tone tone;tone.Start();tone.Submit(Packet(960,20000000,{Event(960,0)}));
    QVERIFY(Silent(Read(tone,960)));QCOMPARE(tone.Status()["queued"].toInt(),960);
    tone.Submit(Packet(960,40000000));QVERIFY(!Silent(Read(tone,1920)));
    QVERIFY(Silent(Read(tone,4800)));QCOMPARE(tone.Status()["underruns"].toInt(),1);
    tone.Submit(Packet(1920,60000000,{Event(1920,40000000)}));QVERIFY(Silent(Read(tone,960)));
    tone.Submit(Packet(1920,80000000));QVERIFY(!Silent(Read(tone,1920)));
    tone.Submit(Packet(1920,1000000000));QVERIFY(tone.Status()["error"].toString().contains("overflow"));
    QCOMPARE(tone.Status()["queued"].toInt(),0);QVERIFY(Silent(Read(tone,4800)));
    QCOMPARE(tone.Status()["overruns"].toInt(),1);
    tone.Submit(Packet(440,1100000000,{Event(440,1000000000)}));QVERIFY(!Silent(Read(tone,4800)));
    tone.Submit(Packet(440,1100000001,{Event(440,1100000002)}));QVERIFY(tone.Status()["error"].toString().contains("Unordered"));
    QVERIFY(Silent(Read(tone,4800)));
    tone.Submit(Packet(440,1200000000,{Event(0,1100000001)}));QVERIFY(tone.Status()["error"].toString().contains("omitted"));
    QVERIFY(Silent(Read(tone,4800)));
  }
};
QTEST_GUILESS_MAIN(SpeakerTest)
#include "speaker.moc"
