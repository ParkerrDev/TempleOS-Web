QT += core gui quick
CONFIG += c++17 link_pkgconfig console
TARGET = pointer-client
SOURCES += client.cpp
include(../../../engine/native/Pointer.pri)
