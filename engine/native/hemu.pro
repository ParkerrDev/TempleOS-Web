QT += core gui qml quick multimedia
CONFIG += c++17 link_pkgconfig
unix:!macx { PKGCONFIG += javascriptcoregtk-4.1 }
macx { LIBS += -framework JavaScriptCore }
LIBS += -lz
TARGET = hemu-native
SOURCES += main.cpp
HEADERS += Js.hpp Streams.hpp Transport.hpp Machine.hpp

RESOURCES += resources.qrc
HEADERS += Input.hpp App.hpp
