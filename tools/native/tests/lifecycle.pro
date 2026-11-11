QT += core gui qml quick multimedia
CONFIG += c++17 link_pkgconfig console
unix:!macx { PKGCONFIG += javascriptcoregtk-4.1 }
macx { LIBS += -framework JavaScriptCore }
LIBS += -lz
TARGET = native-lifecycle
SOURCES += lifecycle.cpp
HEADERS += ../../../engine/native/App.hpp

include(../../../engine/native/Pointer.pri)

QT += dbus
HEADERS += ../../../engine/native/Files.hpp
