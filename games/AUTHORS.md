# Game provenance

The catalog contains 63 entries: 47 games and interactive demos by Terry A. Davis,
8 games or adaptations by TheTinkerer, 6 HolyC games by Austin Sierra, and the site's
HolyCraft and Snake. The first three featured entries remain HolyCraft, TOOM and Snake.

Authorship is explicit in `game-library.js` and `game-credits.js`. Distributing a
TempleOS game in TinkerOS does not make TheTinkerer its original author.
`provenance.json` records original-file hashes, distribution-file hashes, pinned
revisions, introducing commits and archive checksums. `catalog.json` records every
installed file's checksum, including any compatibility adapter.

| Author | Included collections | Evidence |
| --- | --- | --- |
| Terry A. Davis | All 31 entries in Demo/Games; AfterEgypt, Chess, KeepAway, Span, Strut, Titanium, ToTheFront, Vocabulary, X-Caliber; B17, Coach, DiningStars, Flappy, MissileDefense, Rocks, Pilgrims | Compared current TinkerOS files with the official TempleOS ISO and Supplemental 1 at [templeos.org](https://templeos.org/Downloads/). Supplemental 2 and 3 contain hymns. |
| TheTinkerer | Castle Frankenstein 2, Cube, GlowUFOs, Oregon Trail 1975, Scorch, SpyHunt, Sudoku, Tetris | [TinkerOS source and history](https://github.com/tinkeros/TinkerOS), plus the author's CF2, cube, OT1975, SpyHunt and Sudoku repositories. |
| Austin Sierra | TOOM, MarioClone, Malicious Testimonies, Ezekiel, Lord of Hosts, Solomon's Temple | [Author repositories](https://github.com/austings), [GamesMirror discs](https://github.com/austings/GamesMirror) and [TOOM](https://github.com/Church-of-Templeos/TOOM). |

CF2 builds on Terry's Castle Frankenstein, and SpyHunt builds on Terry's Titanium;
both descriptions credit that ancestry. Oregon Trail credits the MECC original and
Don Rawitsch's 1975 revisions. Tetris credits Alexey Pajitnov. TOOM retains id Software
and Freedoom credits and notices. MarioClone credits Nintendo's original characters
and game. Pilgrims retains its US Geological Survey map credit. Other component
credits remain in the upstream sources.

Wordle is credited upstream to xSlendiX, so it is outside this three-author inventory.
TempleNES and TempleGen are emulators requiring separate game ROMs. The Apps tools
Budget, TimeClock, Psalmody, Logic and GrModels are not game titles. Austin's Pellet
archive is a Windows Unity build; Adventure and Cellar_Crawler are Java projects.
His archive's Home/1.HC is a music test and Ezekiel's cellar.HC is an early temple
prototype, not additional published game titles. These are not relabeled as HolyC
games by the three requested authors.

## Reproduce the import

1. Clone `tinkeros/TinkerOS`, `Church-of-Templeos/TOOM`, `austings/MarioClone`,
   `austings/MaliciousTestimonies`, and `austings/GamesMirror` into
   `../.work/upstream/{TinkerOS,TOOM,MarioClone,MaliciousTestimonies,AustinGames}`.
   Check out the revisions recorded in `catalog.json` and `provenance.json`.
2. Download TempleOS.ISO and TOS_Supplemental1/2/3.ISO.C from the official download
   directory into `../.work/upstream/TerryArchives`.
3. Run `python3 tools/extract-game-archives.py`. It checks archive hashes, decodes
   RedSea directory records and TempleOS compression, and writes source trees.
   It never executes a disc's boot or setup scripts. The decoder also reproduced
   455 files byte-for-byte against the independently published TempleOS source tree.
4. Stage TOOM's Freedoom 0.12.1 IWAD and its notices as described in the main README.
5. Run `node tools/sync-games.mjs`, `node tools/audit-game-origins.mjs`,
   `node tools/verify-games.mjs`, and `node tools/game-source.test.mjs`.

Upstream source and embedded DolDoc sprites are retained under `games/upstream`.
Em dashes in UTF-8 text are normalized to hyphens; binary sprite data is unchanged.
Where V5.03 needs a compatibility change, a separate Browser file supplies the
installed version. Both game runners and the HolyC editor use the same package.
The editor preserves binary sprite records when changing source text.

## Compatibility

CF2 and Castle Frankenstein adapt TinkerOS's raw mouse APIs. Lord of Hosts reads the
expanded versions of its original compressed source files. Solomon's Temple uses
the packaged vocabulary path. TOOM has bounds fixes for its melt and sector rendering.
MarioClone initializes its game state, allocates all 32 particle slots, bounds tile
access and restarts from the packaged level path. HEMU fixes the reversed x87
register subtraction/division operands that broke its collision coordinates. Malicious Testimonies has a stock-TempleOS single-player adapter; its upstream
Aiwnios networking is unavailable in the offline guest and is identified in the UI.
Runtime smoke checks establish that a title compiles and opens, not that every level
or possible interaction has been exhaustively tested.

Sprite Studio separately credits [greg0-4's PNG2GR](https://github.com/greg0-4/PNG2GR)
for the conversion inspiration and format reference. Its current natural shading
algorithm is part of TempleOS-Web.
