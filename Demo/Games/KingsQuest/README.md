# King's Quest for TempleOS

The original 1984 PCjr adventure by Roberta Williams and Sierra, rebuilt in HolyC. Graham explores Daventry with the original room artwork, animated characters, vocabulary, puzzles and story. All 85 original room scripts are translated into native HolyC functions. The game draws the original vector pictures and individual sprites itself.

Copy this folder, including `Data`, to TempleOS V5.03 and run `#include "Run.HC"`. TempleOS-Web packages the same files for its TempleOS and browser runners. No floppy upload or emulated PCjr is required.

Use the arrows to walk; type commands such as `look castle` or `show inventory` and press Enter. With the command line empty, `0` jumps, `-` ducks, and `=` starts swimming. F5 saves, F7 restores, F10 toggles sound, and F12 or Shift+Esc exits. `save game`, `restore game` and `restart` also work. The save file is `~/KingsQuest.SAV`; keep the TempleOS disk saved to preserve it between sessions. The direct browser runner keeps saves only until that game run closes. The PC speaker plays the strongest original tone channel.

<details>
<summary>Implementation and verification</summary>

`Run.HC` loads the picture and sprite decoder, game operations, translated room rules, actor movement, and TempleOS input loop. `Data/README.md` records the supplied edition and resource provenance. `Test/Extract.py` reproduces extraction and room translation from that edition for development; the disk is not a runtime dependency.

The development oracles execute the original interpreter to compare room rules, operations, picture maps and sprite rendering against this native implementation. `node Demo/Games/KingsQuest/Test/Journey.mjs` plays a fresh complete winning route using the actual parser and movement, with no inventory or world-state setup. Add `--native` to replay those inputs in stock TempleOS V5.03 through the HolyC-wasm QEMU oracle. It checks each required pickup and the original coronation state. `node Demo/Games/KingsQuest/Test/State.mjs` checks saved sprite underlays and identical actor movement after restoring a save in stock TempleOS V5.03. These checks verify specific behavior, rather than claiming every possible player action has been tested.

</details>

Original game and artwork © Sierra On-Line. Original design by Roberta Williams. Native implementation is a port, not a new claim of authorship. [Original edition and credits](https://archive.org/details/kings-quest-1-pcjr).
