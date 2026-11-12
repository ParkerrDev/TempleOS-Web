#pragma once
#include <QIODevice>
#include <QJsonObject>
#include <QJsonArray>
#include <QMutex>
#include <QMutexLocker>
#include <array>
#include <algorithm>
#include <cmath>
#include <cstring>

class Tone:public QIODevice {
  static constexpr int Rate=48000,Capacity=Rate/2,Prefill=Rate/25;
  mutable QMutex mutex;
  std::array<float,Capacity> samples{};
  int head=0,count=0;
  bool active=false,timed=false,anchored=false,playing=false;
  quint64 ns=0,fraction=0,underruns=0,overruns=0;
  double phase=0,frequency=0;
  QString error;
  void Clear(){head=count=0;anchored=playing=false;phase=0;fraction=0;frequency=0;}
  static bool Time(const QJsonValue &value,quint64 &result) {
    if(!value.isString())return false;
    bool ok=false;const auto text=value.toString();result=text.toULongLong(&ok);
    return ok&&QString::number(result)==text;
  }
  static bool Frequency(const QJsonValue &value,double &result) {
    result=value.toDouble(-1);return value.isDouble()&&std::isfinite(result)&&result>=0&&result<=1193182;
  }
  void Refuse(const QString &message){Clear();error=message;}
  bool Advance(quint64 end) {
    if(end<ns){Refuse("Speaker clock moved backwards");return false;}
    const auto delta=end-ns;
    if(delta>1000000000){overruns++;Refuse("Speaker PCM queue overflow");return false;}
    const auto scaled=delta*Rate+fraction,frames=scaled/1000000000;
    if(frames>quint64(Capacity-count)){overruns++;Refuse("Speaker PCM queue overflow");return false;}
    fraction=scaled%1000000000;ns=end;
    for(quint64 i=0;i<frames;i++) {
      samples[(head+count++)%Capacity]=frequency?(phase<0.5?0.04f:-0.04f):0;
      phase+=frequency/Rate;phase-=std::floor(phase);
    }
    return true;
  }
public:
  Tone(){open(QIODevice::ReadOnly|QIODevice::Unbuffered);}
  void Start(){QMutexLocker lock(&mutex);Clear();error.clear();active=true;}
  void Stop(){QMutexLocker lock(&mutex);active=false;Clear();}
  void Submit(const QJsonObject &packet) {
    QMutexLocker lock(&mutex);if(!active)return;
    double finalFrequency;
    if(!Frequency(packet["frequency"],finalFrequency)){Refuse("Invalid speaker frequency");return;}
    if(!packet["timed"].toBool()) {
      if(timed)Clear();
      timed=false;frequency=finalFrequency;error.clear();return;
    }
    if(!timed){Clear();timed=true;}
    if(!packet["error"].toString().isEmpty()){Refuse(packet["error"].toString());return;}
    quint64 end;
    if(!Time(packet["end"],end)||!packet["events"].isArray()){Refuse("Invalid speaker packet");return;}
    const auto events=packet["events"].toArray();
    if(events.size()>4096){Refuse("Speaker event queue overflow");return;}
    quint64 previous=anchored?ns:0;
    for(const auto &value:events) {
      const auto event=value.toArray();quint64 at;double hz;
      if(event.size()!=2||!Frequency(event[0],hz)||!Time(event[1],at)||at<previous||at>end){Refuse("Unordered speaker packet");return;}
      previous=at;
    }
    if(anchored&&end<ns){Refuse("Speaker clock moved backwards");return;}
    if(!anchored) {
      ns=end;frequency=finalFrequency;
      if(!events.isEmpty()){const auto first=events.first().toArray();Time(first[1],ns);frequency=first[0].toDouble();}
      anchored=true;
    }
    for(const auto &value:events) {
      const auto event=value.toArray();quint64 at;Time(event[1],at);
      if(!Advance(at))return;
      frequency=event[0].toDouble();
    }
    if(frequency!=finalFrequency){Refuse("Speaker packet omitted a transition");return;}
    if(Advance(end))error.clear();
  }
  QJsonObject Status()const {
    QMutexLocker lock(&mutex);
    return {{"active",active},{"timed",timed},{"queued",count},{"underruns",double(underruns)},{"overruns",double(overruns)},{"error",error}};
  }
  qint64 bytesAvailable()const override{return 4096+QIODevice::bytesAvailable();}
  bool isSequential()const override{return true;}
  qint64 readData(char *data,qint64 size)override {
    QMutexLocker lock(&mutex);const qint64 frames=size/sizeof(float);
    if(active&&timed&&!playing&&count>=Prefill)playing=true;
    for(qint64 i=0;i<frames;i++) {
      float value=0;
      if(active&&!timed){value=frequency?(phase<0.5?0.04f:-0.04f):0;phase+=frequency/Rate;phase-=std::floor(phase);}
      else if(active&&playing) {
        if(count){value=samples[head];head=(head+1)%Capacity;count--;}
        else {playing=false;underruns++;}
      }
      memcpy(data+i*sizeof(float),&value,sizeof(value));
    }
    return frames*sizeof(float);
  }
  qint64 writeData(const char *,qint64)override{return -1;}
};
