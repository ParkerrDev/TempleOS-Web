#pragma once
#include <QGuiApplication>
#include <QKeyEvent>
#include <QHash>

inline int ScanKey(const QKeyEvent &event) {
#ifdef Q_OS_LINUX
  //Qt's X11/Wayland evdev keycode includes the XKB offset of eight.
  const unsigned scan=event.nativeScanCode(),key=scan>=8?scan-8:0;
  if(key>0&&key<=83)return key;
  const QHash<unsigned,int> extended={{86,0x56},{87,0x57},{88,0x58},{96,0x11C},{97,0x11D},
    {98,0x135},{99,0x137},{100,0x138},{102,0x147},{103,0x148},{104,0x149},{105,0x14B},
    {106,0x14D},{107,0x14F},{108,0x150},{109,0x151},{110,0x152},{111,0x153},
    {119,0x200},{125,0x15B},{126,0x15C},{127,0x15D}};
  if(extended.contains(key))return extended[key];
#endif
  //Synthetic Qt events have no native code. This also supplies the portable logical-key fallback.
  const QHash<int,int> keys={{Qt::Key_Escape,1},{Qt::Key_1,2},{Qt::Key_2,3},{Qt::Key_3,4},
    {Qt::Key_4,5},{Qt::Key_5,6},{Qt::Key_6,7},{Qt::Key_7,8},{Qt::Key_8,9},{Qt::Key_9,10},{Qt::Key_0,11},
    {Qt::Key_Minus,12},{Qt::Key_Equal,13},{Qt::Key_Backspace,14},{Qt::Key_Tab,15},
    {Qt::Key_Q,16},{Qt::Key_W,17},{Qt::Key_E,18},{Qt::Key_R,19},{Qt::Key_T,20},{Qt::Key_Y,21},
    {Qt::Key_U,22},{Qt::Key_I,23},{Qt::Key_O,24},{Qt::Key_P,25},{Qt::Key_BracketLeft,26},{Qt::Key_BracketRight,27},
    {Qt::Key_Return,28},{Qt::Key_Control,29},{Qt::Key_A,30},{Qt::Key_S,31},{Qt::Key_D,32},{Qt::Key_F,33},
    {Qt::Key_G,34},{Qt::Key_H,35},{Qt::Key_J,36},{Qt::Key_K,37},{Qt::Key_L,38},{Qt::Key_Semicolon,39},
    {Qt::Key_Apostrophe,40},{Qt::Key_QuoteLeft,41},{Qt::Key_Shift,42},{Qt::Key_Backslash,43},
    {Qt::Key_Z,44},{Qt::Key_X,45},{Qt::Key_C,46},{Qt::Key_V,47},{Qt::Key_B,48},{Qt::Key_N,49},{Qt::Key_M,50},
    {Qt::Key_Comma,51},{Qt::Key_Period,52},{Qt::Key_Slash,53},{Qt::Key_Asterisk,55},
    {Qt::Key_Alt,56},{Qt::Key_Space,57},{Qt::Key_CapsLock,58},{Qt::Key_NumLock,69},{Qt::Key_ScrollLock,70},
    {Qt::Key_Enter,0x11C},{Qt::Key_Print,0x137},{Qt::Key_AltGr,0x138},
    {Qt::Key_Home,0x147},{Qt::Key_Up,0x148},{Qt::Key_PageUp,0x149},{Qt::Key_Left,0x14B},{Qt::Key_Right,0x14D},
    {Qt::Key_End,0x14F},{Qt::Key_Down,0x150},{Qt::Key_PageDown,0x151},{Qt::Key_Insert,0x152},
    {Qt::Key_Delete,0x153},{Qt::Key_Meta,0x15B},{Qt::Key_Menu,0x15D},{Qt::Key_Pause,0x200}};
  if(event.key()>=Qt::Key_F1&&event.key()<=Qt::Key_F10)return 59+event.key()-Qt::Key_F1;
  if(event.key()==Qt::Key_F11)return 87;
  if(event.key()==Qt::Key_F12)return 88;
  return keys.value(event.key(),0);
}
