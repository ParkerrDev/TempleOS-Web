QT += core gui waylandcompositor-private
CONFIG += c++17 link_pkgconfig console
PKGCONFIG += wayland-server
TARGET = pointer-server
SOURCES += server.cpp
PROTOCOL_DIR = $$clean_path($$PWD/../../../build/native/protocol)
INCLUDEPATH += $$PROTOCOL_DIR
SOURCES += $$PROTOCOL_DIR/constraints.c $$PROTOCOL_DIR/relative.c
