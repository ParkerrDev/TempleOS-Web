# Startup card

Welcome.HC brings the older TempleOS splash card into V5.03. It runs in a
native popup after a stock boot's disk and display corrections are ready.
It leaves the captured terminal's Take Tour question untouched. A full saved
machine resumes its own windows without opening another card. Explicit game
launch URLs take precedence over the startup card.

Welcome.DAT contains Terry Davis's original public-domain sword-and-scales
bitmap from Doc/Splash1.DAT in the 2014-07-15 archive:
https://github.com/Francesco149/TempleOSGit/tree/a843cc86431af8ef59a396e50cb7c314f65a2430

That archive calls the splash V2.11; its graphic matches the V2.17 video. The
19,456 pixel bytes and terminating zero are unchanged. The old serialized
bitmap header (type, width, height, x, y) is reordered to V5.03's
(type, x, y, width, height). The card displays the running OS's version.
