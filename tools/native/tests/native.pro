QT += core gui qml quick multimedia testlib
CONFIG += c++17 link_pkgconfig console
unix:!macx { PKGCONFIG += javascriptcoregtk-4.1 }
macx { LIBS += -framework JavaScriptCore }
LIBS += -lz
TARGET = native-test
SOURCES += native.cpp
RESOURCES += ../../../engine/native/resources.qrc

HEADERS += ../../../engine/native/App.hpp
