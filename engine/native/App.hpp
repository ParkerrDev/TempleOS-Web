#pragma once
#include "Machine.hpp"
#include "Input.hpp"
#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QQuickPaintedItem>
#include <QQuickWindow>
#include <QPainter>
#include <QThread>
#include <QTimer>
#include <QElapsedTimer>
#include <QAudioSink>
#include <QMediaDevices>
#include <QIODevice>
#include <algorithm>
#include <cmath>
#include <QMutex>
#include <QMutexLocker>

class Screen:public QQuickPaintedItem {
  Q_OBJECT
  Q_PROPERTY(QImage image READ image WRITE setImage NOTIFY imageChanged)
  QImage value;
public:
  QImage image()const{return value;}
  void setImage(const QImage &next){value=next;update();emit imageChanged();}
  void paint(QPainter *p)override {
    p->fillRect(boundingRect(),Qt::black);p->setRenderHint(QPainter::SmoothPixmapTransform,false);
    p->drawImage(boundingRect(),value);
  }
signals:void imageChanged();
};

class Tone:public QIODevice {
  double phase=0;int rate=48000;
  std::atomic<double> frequency{0};
public:
  Tone(){open(QIODevice::ReadOnly);}
  void Set(double value){frequency.store(value>0&&std::isfinite(value)?value:0);}
  void Rate(int value){rate=value;}
  qint64 bytesAvailable()const override{return 4096+QIODevice::bytesAvailable();}
  bool isSequential()const override{return true;}
  qint64 readData(char *data,qint64 size)override {
    qint64 count=size/sizeof(float);double f=frequency.load();
    for(qint64 i=0;i<count;i++){const float value=f?(phase<0.5?0.04f:-0.04f):0;memcpy(data+i*sizeof(float),&value,sizeof(value));phase+=f/rate;phase-=std::floor(phase);}
    return count*sizeof(float);
  }
  qint64 writeData(const char *,qint64)override{return -1;}
};

struct FrameMailbox {
  QMutex mutex;
  QImage image;
  bool pending=false;
};

class Engine:public QObject {
  Q_OBJECT
  std::unique_ptr<Machine> machine;
  std::atomic<bool> *cancel;
  FrameMailbox *mailbox;
  QTimer timer;QElapsedTimer clock;
  int frameSerial=-1;
  QString fatalMessage;
  QJsonObject lastState;
  void State(const QJsonObject &state){if(state!=lastState){lastState=state;emit stateChanged(state);}}
  void Frame(const QImage &image) {
    bool notify=false;
    {QMutexLocker lock(&mailbox->mutex);mailbox->image=image;notify=!mailbox->pending;mailbox->pending=true;}
    if(notify)emit frameReady();
  }
  void Present() {
    auto state=machine->Call("Status").toObject();
    if(!fatalMessage.isEmpty()){state["fault"]=fatalMessage;state["paused"]=true;state["tone"]=0;}
    if(state["frameSerial"].toInt()!=frameSerial) {
      frameSerial=state["frameSerial"].toInt();Frame(machine->Image());
    }
    State(state);
  }
  void Failed(const std::exception &error){emit errorOccurred(QString::fromUtf8(error.what()));}
public:
  Engine(std::atomic<bool> *flag,FrameMailbox *frames):cancel(flag),mailbox(frames) {
    timer.setParent(this);timer.setInterval(1);
    connect(&timer,&QTimer::timeout,this,&Engine::Tick);
  }
public slots:
  void Open(QString path) {
    timer.stop();emit busyChanged(true);
    try {
      if(machine)machine->Call("Pause",{true});
      auto next=std::make_unique<Machine>(cancel,[this](const char *mode,size_t bytes){
        if(bytes%(8*1024*1024)<131072)emit progress(QString::fromLatin1(mode),bytes);
      });next->Call("Open",{path});
      //Nothing from the candidate becomes visible until the complete input validates.
      const auto state=next->Call("Status").toObject();const auto image=next->Image();
      if(cancel->load())throw std::runtime_error("Operation cancelled");
      machine=std::move(next);fatalMessage.clear();frameSerial=state["frameSerial"].toInt();
      Frame(image);State(state);emit opened(path);
    } catch(const std::exception &error){cancel->store(false);Failed(error);if(machine)Present();}
    cancel->store(false);emit busyChanged(false);clock.restart();if(machine&&fatalMessage.isEmpty())timer.start();
  }
  void Save(QString path) {
    timer.stop();emit busyChanged(true);
    try {
      if(!machine)throw std::runtime_error("No complete machine is loaded");
      if(!fatalMessage.isEmpty())throw std::runtime_error("Reopen a working session before saving after a host execution failure");
      machine->Call("Save",{path});emit saved(path);
    } catch(const std::exception &error){Failed(error);}
    cancel->store(false);emit busyChanged(false);clock.restart();if(machine&&fatalMessage.isEmpty())timer.start();
  }
  void Pause(bool paused) {
    if(!machine)return;
    try{if(!paused&&!fatalMessage.isEmpty())throw std::runtime_error(fatalMessage.toStdString());machine->Call("Pause",{paused});Present();clock.restart();}catch(const std::exception &error){Failed(error);}
  }
  void Key(int key,bool down){if(machine)try{machine->Call("Key",{key,down});}catch(const std::exception &error){Failed(error);}}
  void Mouse(QJsonObject point){if(machine)try{machine->Call("Mouse",{point});}catch(const std::exception &error){Failed(error);}}
  void Release(){if(machine)try{machine->Call("Release");}catch(const std::exception &error){Failed(error);}}
  void Tick() {
    const qint64 ns=clock.nsecsElapsed();clock.restart();
    try{machine->Call("Tick",{static_cast<double>(ns)});Present();}
    catch(const std::exception &error){
      timer.stop();fatalMessage=tr("Host execution failed: %1. Reopen a working session.").arg(QString::fromUtf8(error.what()));
      auto state=lastState;state["fault"]=fatalMessage;state["paused"]=true;state["tone"]=0;State(state);
      emit errorOccurred(fatalMessage);emit fatal();
    }
  }
signals:
  void progress(QString,qulonglong);void frameReady();void stateChanged(QJsonObject);void errorOccurred(QString);void busyChanged(bool);
  void opened(QString);void saved(QString);void fatal();
};

class Backend:public QObject {
  Q_OBJECT
  Q_PROPERTY(QImage image READ image NOTIFY imageChanged)
  Q_PROPERTY(QString status READ status NOTIFY changed)
  Q_PROPERTY(bool busy READ busy NOTIFY changed)
  Q_PROPERTY(bool paused READ paused NOTIFY changed)
  Q_PROPERTY(bool ready READ ready NOTIFY changed)
  Q_PROPERTY(QString path READ path NOTIFY changed)
  Q_PROPERTY(bool faulted READ faulted NOTIFY changed)
  QThread thread;std::atomic<bool> cancelFlag{false};FrameMailbox mailbox;Engine *engine;
  QImage value;QString message,filename;bool working=false,stopped=true,loaded=false;
  QJsonObject state;Tone tone;std::unique_ptr<QAudioSink> audio;
public:
  Backend():engine(new Engine(&cancelFlag,&mailbox)) {
    engine->moveToThread(&thread);connect(&thread,&QThread::finished,engine,&QObject::deleteLater);
    connect(this,&Backend::openRequested,engine,&Engine::Open);connect(this,&Backend::saveRequested,engine,&Engine::Save);
    connect(this,&Backend::pauseRequested,engine,&Engine::Pause);connect(this,&Backend::keyRequested,engine,&Engine::Key);
    connect(this,&Backend::mouseRequested,engine,&Engine::Mouse);connect(this,&Backend::releaseRequested,engine,&Engine::Release);
    connect(engine,&Engine::progress,this,[this](QString mode,qulonglong bytes){message=mode=="read"?tr("Loading session: %1 MiB").arg(bytes/(1024*1024)):tr("Saving session: %1 MiB").arg(bytes/(1024*1024));emit changed();});
    connect(engine,&Engine::frameReady,this,[this]{
      {QMutexLocker lock(&mailbox.mutex);value=mailbox.image;mailbox.pending=false;}
      emit imageChanged();
    });
    connect(engine,&Engine::busyChanged,this,[this](bool next){working=next;tone.Set(next?0:state["tone"].toDouble());emit changed();});
    connect(engine,&Engine::stateChanged,this,[this](QJsonObject next){state=next;stopped=state["paused"].toBool();if(!state["fault"].toString().isEmpty())message=state["fault"].toString();tone.Set(working?0:state["tone"].toDouble());emit changed();});
    connect(engine,&Engine::errorOccurred,this,[this](QString error){message=error;tone.Set(0);emit changed();});
    connect(engine,&Engine::fatal,this,[this]{stopped=true;tone.Set(0);emit changed();});
    connect(engine,&Engine::opened,this,[this](QString file){filename=file;loaded=true;message=faulted()?state["fault"].toString():tr("Session restored");emit changed();});
    connect(engine,&Engine::saved,this,[this](QString file){message=tr("Saved %1").arg(file);emit changed();});
    const auto device=QMediaDevices::defaultAudioOutput();QAudioFormat format;format.setSampleRate(48000);format.setChannelCount(1);format.setSampleFormat(QAudioFormat::Float);
    if(!device.isNull()&&device.isFormatSupported(format)){tone.Rate(48000);audio=std::make_unique<QAudioSink>(device,format);audio->start(&tone);}
    else message=tr("No supported audio output is available");
    thread.start();
  }
  ~Backend(){tone.Set(0);if(audio)audio->stop();cancelFlag.store(true);thread.quit();thread.wait();}
  QImage image()const{return value;}QString status()const{return message;}bool busy()const{return working;}
  bool paused()const{return stopped;}bool ready()const{return loaded;}QString path()const{return filename;}bool faulted()const{return !state["fault"].toString().isEmpty();}
  Q_INVOKABLE void open(const QString &path){if(working||path.isEmpty())return;cancelFlag.store(false);working=true;tone.Set(0);message=tr("Loading session…");emit changed();emit openRequested(path);}
  Q_INVOKABLE void save(const QString &path){if(working||!loaded||path.isEmpty())return;cancelFlag.store(false);working=true;tone.Set(0);message=tr("Saving session…");emit changed();emit saveRequested(path);}
  Q_INVOKABLE void cancel(){if(working)cancelFlag.store(true);}
  Q_INVOKABLE void pause(){if(!working&&loaded){tone.Set(0);emit pauseRequested(!stopped);}}
  Q_INVOKABLE void release(){emit releaseRequested();}
  Q_INVOKABLE void mouse(double x,double y,int buttons,int wheel=0){if(!working)emit mouseRequested({{"x",std::clamp(x,0.0,639.0)},{"y",std::clamp(y,0.0,479.0)},{"b",buttons&3},{"wheel",wheel}});}
  bool eventFilter(QObject *target,QEvent *event)override {
    if(event->type()==QEvent::WindowDeactivate)release();
    if(event->type()==QEvent::KeyPress||event->type()==QEvent::KeyRelease) {
      auto *key=static_cast<QKeyEvent *>(event);auto *window=qobject_cast<QQuickWindow *>(target);
      if(window&&window->activeFocusItem()&&window->activeFocusItem()->objectName()=="screen") {
        const int code=ScanKey(*key);if(code){if(!working&&!key->isAutoRepeat())emit keyRequested(code,event->type()==QEvent::KeyPress);return true;}
      }
    }
    return QObject::eventFilter(target,event);
  }
signals:
  void imageChanged();void changed();void openRequested(QString);void saveRequested(QString);void pauseRequested(bool);
  void keyRequested(int,bool);void mouseRequested(QJsonObject);void releaseRequested();
};
