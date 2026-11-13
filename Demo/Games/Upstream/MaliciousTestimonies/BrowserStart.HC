// TempleOS-Web package entry. Upstream files retain their embedded sprites.
#exe {Cd(__DIR__);}
// Networking types remain in the source data model; no network calls are made.
class CNetAddr {};
U0 WritePacket(I64 socket,U8 *msg,Bool to_free=TRUE) {if(to_free)Free(msg);throw('Offline');}
Bool browser_auto_complete=AutoComplete(OFF);
#include "Load.HC";
AutoComplete(browser_auto_complete);
