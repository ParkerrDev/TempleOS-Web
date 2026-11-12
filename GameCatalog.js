import {EXTRA_GAMES} from "./game-library.js";

export const GAMES = [
  // custom dual-target games (run in the browser bypass OR the real OS; your edits are cached)
  { file: "HolyCraft.HC", name: "HolyCraft", blurb: "A 3D voxel sandbox - walk a blocky world, break & place blocks. A real-time raycaster in HolyC.",
    how: "W/S move · A/D strafe · R/F up/down · move MOUSE or J/L/I/K to look · LEFT-click break · RIGHT-click place · 1-9 pick block · Esc quit" },
  { file: "Snake.HC", name: "Snake", blurb: "The classic. Eat the apples, don't bite your tail.",
    how: "W/A/S/D to steer · Esc to quit" },
  { file: "Babel.HC", name: "Babel", blurb: "Stones fall onto the tower. Clear full rows; the Latin cross always stays upright.",
    how: "A/D or Left/Right move · W or Up turns (cross stays upright) · S or Down falls faster · Space drops · P pauses · Esc quits" },
  { file: "Volley.HC", name: "Volley", blurb: "Two players, one ball, first to 7. Player 1 plays W/S, player 2 plays the Up and Down arrows.",
    how: "Player 1: W/S · Player 2: Up/Down · Space serves · P pauses · Esc quits" },
  // install: the file is written to that path as bytes and run from there, for
  // a game whose images and sounds follow its text in one file.
  { file: "FNAF.HC", name: "FNAF", install: "C:/Home/Games/FNAF.HC",
    blurb: "Five Nights at Freddy's, ported to HolyC. Watch the cameras, mind the power and survive the night until 6 AM.",
    how: "Enter starts · A/D doors · Q/E lights · Space monitor · 1-9, 0, - cameras · N mutes the call · or click the buttons · Esc twice quits" },
  // Both source collections use HolyC-WASM for browser play; TempleOS is explicit.
  { name: "Varoom",        disk: "C:/Home/Games/TinkerOS/Varoom.HC", packageId: "tinker-Varoom",        blurb: "Top-down racing - keep your foot down and hold the track." },
  { name: "Talons",        disk: "C:/Home/Games/TinkerOS/Talons.HC", packageId: "tinker-Talons",        blurb: "Joust-style aerial combat: flap above your foe and skewer them." },
  { name: "BlackDiamond",  disk: "C:/Home/Games/TinkerOS/BlackDiamond.HC", packageId: "tinker-BlackDiamond",  blurb: "Downhill skiing - carve the slope and dodge the trees." },
  { name: "FlatTops",      disk: "C:/Home/Games/TinkerOS/FlatTops.HC", packageId: "tinker-FlatTops",      blurb: "WWII Pacific aircraft-carrier warfare." },
  { name: "Halogen",       disk: "C:/Home/Games/TinkerOS/Halogen.HC", packageId: "tinker-Halogen",       blurb: "A fast top-down arena shooter." },
  { name: "CastleFrankenstein", disk: "C:/Home/Games/TinkerOS/CastleFrankenstein.HC", packageId: "tinker-CastleFrankenstein", blurb: "Sneak through the castle - a Castle Wolfenstein homage." },
  { name: "BattleLines",   disk: "C:/Home/Games/TinkerOS/BattleLines.HC", packageId: "tinker-BattleLines",   blurb: "A tactical battle along the front lines." },
  { name: "BigGuns",       disk: "C:/Home/Games/TinkerOS/BigGuns.HC", packageId: "tinker-BigGuns",       blurb: "Artillery duel - pick your angle and power." },
  { name: "BomberGolf",    disk: "C:/Home/Games/TinkerOS/BomberGolf.HC", packageId: "tinker-BomberGolf",    blurb: "Golf, with bombs." },
  { name: "FlapBat",       disk: "C:/Home/Games/TinkerOS/FlapBat.HC", packageId: "tinker-FlapBat",       blurb: "Flap through the gaps - a Flappy-Bird-like." },
  { name: "Maze",          disk: "C:/Home/Games/TinkerOS/Maze.HC", packageId: "tinker-Maze",          blurb: "Find your way out of the maze." },
  { name: "TreeCheckers",  disk: "C:/Home/Games/TinkerOS/TreeCheckers.HC", packageId: "tinker-TreeCheckers",  blurb: "Checkers (draughts) against the computer." },
  { name: "TicTacToe",     disk: "C:/Home/Games/TinkerOS/TicTacToe.HC", packageId: "tinker-TicTacToe",     blurb: "Classic noughts and crosses." },
  { name: "Whap",          disk: "C:/Home/Games/TinkerOS/Whap.HC", packageId: "tinker-Whap",          blurb: "Protect your base - whack the attackers." },
  { name: "Wenceslas",     disk: "C:/Home/Games/TinkerOS/Wenceslas.HC", packageId: "tinker-Wenceslas",     blurb: "A wintry arcade romp." },
  { name: "RawHide",       disk: "C:/Home/Games/TinkerOS/RawHide.HC", packageId: "tinker-RawHide",       blurb: "An arcade game from the TempleOS collection." },
  { name: "TheDead",       disk: "C:/Home/Games/TinkerOS/TheDead.HC", packageId: "tinker-TheDead",       blurb: "Survive against the dead." },
  { name: "Squirt",        disk: "C:/Home/Games/TinkerOS/Squirt.HC", packageId: "tinker-Squirt",        blurb: "An arcade game from the TempleOS collection." },
  { name: "Zing",          disk: "C:/Home/Games/TinkerOS/Zing.HC", packageId: "tinker-Zing",          blurb: "A fast reflex arcade game." },
  { name: "ZoneOut",       disk: "C:/Home/Games/TinkerOS/ZoneOut.HC", packageId: "tinker-ZoneOut",       blurb: "A block-busting arcade game." },
  { name: "RocketScience", disk: "C:/Home/Games/TinkerOS/RocketScience.HC", packageId: "tinker-RocketScience", blurb: "Rocket flight, the hard way." },
  { name: "Rocket",        disk: "C:/Home/Games/TinkerOS/Rocket.HC", packageId: "tinker-Rocket",        blurb: "Lunar-lander-style rocket physics." },
  { name: "DunGen",        disk: "C:/Home/Games/TinkerOS/DunGen.HC", packageId: "tinker-DunGen",        blurb: "A procedural dungeon generator." },
  // ---- graphics / physics demos that live in the Games folder ----
  { name: "MassSpring",    disk: "C:/Home/Games/TinkerOS/MassSpring.HC", packageId: "tinker-MassSpring",    blurb: "Mass-and-spring physics sandbox - left-click to place masses." },
  { name: "Collision",     disk: "C:/Home/Games/TinkerOS/Collision.HC", packageId: "tinker-Collision",     blurb: "An elastic-collision physics demo." },
  { name: "RainDrops",     disk: "C:/Home/Games/TinkerOS/RainDrops.HC", packageId: "tinker-RainDrops",     blurb: "A falling-raindrops graphics demo." },
  { name: "CircleTrace",   disk: "C:/Home/Games/TinkerOS/CircleTrace.HC", packageId: "tinker-CircleTrace",   blurb: "A spirograph-style circle-tracing demo." },
  { name: "ElephantWalk",  disk: "C:/Home/Games/TinkerOS/ElephantWalk.HC", packageId: "tinker-ElephantWalk",  blurb: "An animated walk-cycle demo." },
  { name: "CharDemo",      disk: "C:/Home/Games/TinkerOS/CharDemo.HC", packageId: "tinker-CharDemo",      blurb: "A character-set and font demo." },
  { name: "Digits",        disk: "C:/Home/Games/TinkerOS/Digits.HC", packageId: "tinker-Digits",        blurb: "A rainbow-digits graphics demo." },
  { name: "Stadium", disk: "C:/Home/Games/TinkerOS/Stadium/Stadium.HC", packageId: "tinker-Stadium", blurb: "A stadium ball game with the original sprite background." },
  { name: "TOOM", disk: "C:/Home/TOOM/Run.HC", packageId: "toom", blurb: "A DOOM engine written in HolyC, with Freedoom's first episode.", how: "Arrows turn and move · W/S move, A/D strafe · Ctrl fires · Space opens doors and switches · Shift runs · number keys pick a weapon · P pauses" },
];
GAMES.push(...EXTRA_GAMES);
const featured=['HolyCraft','TOOM','Babel','Volley','Snake'];
GAMES.sort((a,b)=>(featured.includes(a.name)?featured.indexOf(a.name):featured.length)-(featured.includes(b.name)?featured.indexOf(b.name):featured.length));
