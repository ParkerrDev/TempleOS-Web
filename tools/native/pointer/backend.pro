QT += core gui qml quick multimedia
CONFIG += c++17 link_pkgconfig console
PKGCONFIG += javascriptcoregtk-4.1
LIBS += -lz
TARGET = pointer-backend
SOURCES += backend.cpp
HEADERS += ../../../engine/native/App.hpp
RESOURCES += ../../../engine/native/resources.qrc
include(../../../engine/native/Pointer.pri)
