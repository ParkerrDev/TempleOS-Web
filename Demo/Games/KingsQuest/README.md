# King's Quest for TempleOS

Play the original 1984 IBM PCjr edition of Roberta Williams's adventure. The HolyC player implements the PCjr instructions and devices that Sierra's interpreter uses. The supplied floppy provides the original room logic, command vocabulary, character animation, score, encounters, sound sequences and artwork.

On TempleOS V5.03 or HEMU, put `KQ1PCJR.IMG` in `C:/Home`. Copy this folder to your disk, open it and enter `#include "Run.HC"`. On TempleOS-Web choose King's Quest in Games, choose a runner and select your IMG or the original ZIP. The file is read locally.

Use the arrows to walk and type commands such as `look`. Return submits a command. F10 toggles sound. F12 or Shift+Esc leaves the HolyC player. Type `save game` or `restore game` and select a letter from A through Z. For progress that survives closing the player, use the TempleOS runner with disk persistence enabled. The disk's own save writes go to a working copy in `~/KQ1SAVE.IMG`. The TempleOS PC speaker plays the loudest tone channel. The port uses the TempleOS character font for BIOS text.

The tested disk is 368,640 bytes with SHA-256 `9647acdbadb0b8ebd3af8d19a02cb549dc7282659cde0efe5d15390cafb4af29`. The original files are supplied by the player. [Edition and credits](https://archive.org/details/kings-quest-1-pcjr)

With the sibling projects installed, run `KQ_DISK=/path/to/KQ1PCJR.IMG node Demo/Games/KingsQuest/Test/Disk.mjs` from the website checkout. It boots stock V5.03, submits commands to the original parser, picks a carrot and restores the castle from slot A.
