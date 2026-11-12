QT += core gui qml quick multimedia dbus
CONFIG += c++17 link_pkgconfig console
PKGCONFIG += javascriptcoregtk-4.1
LIBS += -lz
TARGET = audio-test
SOURCES += audio.cpp
HEADERS += ../../../engine/native/App.hpp ../../../engine/native/Files.hpp
include(../../../engine/native/Pointer.pri)
