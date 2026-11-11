HEADERS += $$PWD/Pointer.hpp
SOURCES += $$PWD/Pointer.cpp
linux {
  !versionAtLeast(QT_VERSION,6.12.0): error("Native Wayland pointer capture requires Qt 6.12 or later")
  QT += gui-private
  PKGCONFIG += wayland-client
  POINTER_PROTOCOL_DIR = $$clean_path($$PWD/../../build/native/protocol)
  INCLUDEPATH += $$POINTER_PROTOCOL_DIR
  SOURCES += $$POINTER_PROTOCOL_DIR/constraints.c $$POINTER_PROTOCOL_DIR/relative.c
}
