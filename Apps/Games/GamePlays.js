// The play check's input for every Games entry, by name: the keys and mouse its own
// instructions or source name. Steps are separated by ";": "T ACT ACT...", T in
// seconds after the startup wait (Demo/Games/Test/Install.mjs START_WAIT). An ACT is a
// key name, tapped for 0.1 s; a key name and + or - to hold or release it; "mX,Y" to
// move the mouse to screen pixel X,Y; "lb" or "rb" to click, with + or - to hold or
// release. The last step quits. Key names are Demo/Games/Test/Play.mjs's KEYS.
// The programs of Apps/Programs.js follow the games. Demo/Games/Test/Start.mjs plays
// these in V5.03 and HEMU, Apps/Games/Games.browser.mjs in HolyC-WASM, and
// Demo/Games/Play.json records what each did.
export const PLAYS={
  "After Davis":"1 enter;2 space;3 l;4 right;5 n;6 n;7 esc",
  "King's Quest":"1 enter;2 enter;3 right;4 right;5 l o o k enter;6 shift+ esc shift-",
  "HolyCraft":"1 w+;2 w-;3 l+;4 l-;5 m420,240;6 3;7 lb;8 esc", //Held W/A/S/D walk, J/L/I/K turn, the mouse looks, 1-9 pick a block, left button breaks, Esc quits.
  "TOOM":"1 up+;2 up-;3 left+;4 left-;5 ctrl;6 right+;7 right-;8 esc", //Toom/TmInput.HC: held arrows move and turn, Ctrl fires; TmPlay.HC: Esc quits.
  "Babel":"1 a;2 a;3 w;4 d;5 space;6 esc", //A/D move, W turns, Space drops, Esc quits.
  "Volley":"1 space;2 w+;3 w-;4 down+;5 down-;6 esc", //Space serves, held W/S and Up/Down move the paddles, Esc quits.
  "Snake":"1 up;2 left;3 down;4 right;5 esc", //Arrows or W/A/S/D turn, Esc quits.
  "FNAF":"1 enter;2 space;3 2;4 space;5 a;6 q;7 esc esc", //Enter starts the night, Space raises the monitor, digits pick cameras, A the left door, Q its light; Esc twice in 3 s quits.
  "Varoom":"1 up up up;2 left;3 left;4 right;5 down;6 esc", //Left/Right steer, Up speeds, Down brakes, Esc quits.
  "Talons":"1 left left left;2 left left left;3 up up up;4 right right right;5 down down down;6 esc", //Left/Right roll, Up/Down pitch, Esc quits.
  "BlackDiamond":"1 enter;2 left;3 left;4 right;5 down;6 esc", //Enter starts a run, arrows move the skier, Esc quits.
  "FlatTops":"1 space;2 m320,100 rb;3 m500,300 lb;4 m100,400 rb;5 esc", //Space closes the intro; left button sets a course, right button launches a squadron; Esc quits.
  "Halogen":"1 up+;2.5 up-;3 left+;3.5 left-;4 right+;4.5 right-;5 esc", //Held Up speeds, held Left/Right move the car, Esc quits.
  "CastleFrankenstein":"1 up up;2 right right;3 up up;4 space;5 left left;6 esc", //Up walks, Left/Right turn, Space fires, Esc quits.
  "BattleLines":"1 space;2 2;3 m320,240;4 m200,300;5 m420,200;6 esc", //Space closes the intro, '2' is tap mode where the mouse pushes troopers, Esc quits.
  "BigGuns":"1 space;2 space;3 left left left;4 space;5 right right;6 esc", //Space closes two intros, Left/Right aim, Space fires, Esc quits.
  "BomberGolf":"1 left left;2 up up;3 space;4 right right;5 space;6 esc", //Left/Right turn, Up/Down speed, Space bombs, Esc quits.
  "FlapBat":"1 space;2 space;3 space;4 space;5 space;6 esc", //Space closes the intro and flaps, Esc quits.
  "Maze":"1 m100,320 lb+;2 m200,320;3 m300,320;4 lb-;5 m300,240 rb;7 esc", //Left button draws walls, right button solves, Esc quits.
  "TreeCheckers":"1 space;3 space;4 m100,240 lb+;5 m130,240;6 lb-;7 m540,240 lb+;8 m510,240 lb-;9 esc", //Space picks the size and closes the intro; drag a unit with the left button; Esc quits.
  "TicTacToe":"1 m258,266;2 lb;3 m158,166;4 lb;5 m358,366;6 lb;7 ctrl+ alt+ c alt- ctrl-", //The mark follows the mouse, a click places it; it prints CTRL-ALT-c to exit.
  "Whap":"1 m100,100;2 m500,100;3 m500,400;4 m100,400;5 m320,240;6 esc", //The ball follows the mouse; any key quits.
  "Wenceslas":"1 space;2 space;3 space;4 right right right;5 down down down;6 space;7 left left;8 esc", //Space closes three verses and burns trees, arrows walk, Esc quits.
  "RawHide":"1 space;2 m200,200;3 m400,300;4 m300,400;5 m500,150;6 esc", //Space closes the intro, the cattle flee the mouse, Esc quits.
  "TheDead":"1 down;2 down;3 space+;4 space-;5 up;6 right+;7 right-;8 esc", //Up/Down move, held Space or Right fires, Esc quits.
  "Squirt":"1 left;2 left;3 up;4 up;5 right;6 down;7 esc", //Arrows move the nozzle, Esc quits.
  "Zing":"1 m340,365;2 lb+;3 m300,400;4 lb-;5 m320,370 lb+;6 m350,400 lb-;7 enter;8 esc", //Left button draws the bow, release fires, Enter restarts, Esc quits.
  "ZoneOut":"1 space;2 space;3 left left left left;4 up up;5 space;6 right right;7 esc", //Space closes the intro and fires, Left/Right turn, Up moves, Esc quits.
  "RocketScience":"1 down;2 down;3 enter;4 space;8 esc", //Down Down Enter picks the anti-spin coefficient, any key launches, Esc quits.
  "Rocket":"1 up;2 up+;3 up-;4 right+;5 right-;6 left+;7 left-;8 esc", //A key blasts off, held Up thrusts, held Left/Right tilt, Esc quits.
  "DunGen":"1 right;2 down;3 left;4 up;5 space+ right;6 space-;7 esc", //Arrows move, Space with an arrow attacks, Esc quits.
  "MassSpring":"1 space;2 m200,200 lb;3 m350,220 lb;4 m200,200 rb+;5 m350,220 rb-;6 m420,320 lb;7 esc", //Space closes the intro, left click places a mass, a right drag joins two, Esc quits.
  "Collision":"1 m200,150;2 m450,330;3 esc", //No controls but the mouse cursor; any key quits.
  "RainDrops":"1 1+;3 1-;4 2+;6 2-;7 enter;8 esc", //Held '1' and '2' open the gates, Enter resets, Esc quits.
  "CircleTrace":"1 m420,240 lb+;2 m320,140;3 m220,240;4 m320,340;5 m420,240 lb-;8 esc", //Drag the left button round the circle, Esc quits.
  "ElephantWalk":"1 right;2 right;3 down;4 left;5 up;6 esc", //Arrows move the elephant, Esc quits.
  "CharDemo":"1 right;2 down;3 left;4 up;5 enter;6 esc", //Arrows scroll the map, Enter makes a new one, Esc quits.
  "Digits":"1 space;2 space;3 5;4 space;5 space;6 esc", //A key goes on, digits guess, Esc quits.
  "Stadium":"1 m320,70 lb;2 m150,60 lb;3 m480,80 lb;4 m250,65 lb;5 enter;6 esc", //A click throws at the fans, Enter restarts, Esc quits.
  "AfterEgypt":"1 space;3 space;5 space;7 esc", //A key breaks camp, Space picks Break Camp, Esc on the menu ends it.
  "Chess":"1 space;2 space;3 down down;4 space+;5 up up;6 space-;7 esc", //Space answers both YES, arrows move the cursor, Space down picks and up drops, Esc quits.
  "KeepAway":"1 space;2 m120,150;3 m500,380;4 lb;5 m320,240 rb;6 j;7 space;8 esc", //Space closes the intro, the player runs to the mouse, left passes, right or J jumps, Space shoots, Esc quits.
  "Span":"1 space;2 m300,330 lb;3 m420,330 lb;4 s;5 m300,330 lb+;6 m420,330 lb-;7 space;8 shift+ esc shift-", //Space closes the intro, left click places a mass, S is steel, a drag adds a member, Space runs; Shift-Esc quits (Esc asks to save).
  "Strut":"1 space;2 m250,250 lb;3 m350,250 lb t;4 m250,250 lb+;5 m350,250 lb-;6 space;7 1+;8 1- esc", //A key goes on, left click places a mass, T is thruster mode, Space plays, held '1' fires it, Esc quits.
  "Titanium":"1 space;2 space+;3 left+;4 left- right+;5 right- space-;6 ctrl+ right ctrl-;7 esc", //A key goes on, held Space fires, held Left/Right move, Ctrl-Right launches a missile, Esc quits.
  "ToTheFront":"1 space;2 space;3 space;5 2;6 1;7 space;9 esc", //Space picks Human twice and closes help, '1' and '2' pick the view, Space ends the phase, Esc quits.
  "Vocabulary":"1 1;3 esc;4 2;6 esc;7 esc", //'1'-'4' answer, Esc closes the definition, Esc at the prompt quits.
  "X-Caliber":"1 space;2 m320,200 lb space;3 up+;4 up-;5 left+;6 left-;7 space;8 esc", //Space ticks the tip and starts the level, held arrows fly, Space fires, Esc quits.
  "Castle Frankenstein 2":"1 space;2 left;3 left;4 w;5 space;6 right;7 esc", //A key goes on, W walks, Left/Right turn, Space fires, Esc quits.
  "Cube":"1 down down down down;2 space;3 right;4 r;5 up;6 u;7 esc", //Down and Space pick the level, arrows turn the cube, R and U turn faces, Esc quits.
  "GlowUFOs":"1 space;2 right+;3 right-;3.5 space+;4.5 space-;5 up+;6 up-;7 esc", //A key starts, held arrows move, Space fires, Esc quits.
  "Oregon Trail 1975":"1 n;2 2 5 0 enter;3 1 0 0 enter;4 5 0 enter;5 1 0 0 enter;6 esc", //N skips the instructions, numbers buy oxen, food, ammo and clothing; nothing in it quits on a key.
  "Scorch":"1 left+;1.5 left-;2.5 up+;3 up-;4 space;8 esc", //Held arrows aim and set power, Space fires, Esc quits.
  "SpyHunt":"1 space;2 left+;3 left-;3.5 space+;4.5 space-;5 right+;6 right-;7 esc", //A key goes on, held Left/Right steer, held Space fires, Esc quits.
  "Sudoku":"1 right;2 down;3 5;4 right;5 7;6 esc", //Arrows move the cursor, digits fill a cell, Esc quits.
  "Tetris":"1 space;2 left;3 up;4 right;5 space;6 left;7 esc", //A key starts, Left/Right move, Up turns, Space drops, Esc quits.
  "B17":"1 left;2 left;3 space;4 right;5 space;6 esc", //Left/Right tilt, Space bombs, Esc quits.
  "Coach":"1 space;3 space;5 enter;6 space;8 esc", //Space swings, Enter restarts, Esc quits.
  "DiningStars":"1 space;2 up;3 up;4 left;5 left;6 up;7 esc", //A key ends the floor plan, Up/Down walk, Left/Right turn, Esc quits.
  "Flappy":"1 enter;2 space;2.5 space;3.5 space;4 space;5 space;6 esc", //Enter restarts, Space flaps, Esc quits.
  "MissileDefense":"1 space;2 space;3 m320,150 2;4 m150,200 1;5 m500,200 3;6 enter;7 esc", //Space closes two intros, '1'-'3' fire at the mouse, Enter restarts, Esc quits.
  "Rocks":"1 space;2 right+;3 right-;3.5 up+;4.5 up-;5 space;6 space;7 esc", //Space closes the intro, held arrows spin and thrust, Space fires, Esc quits.
  "Pilgrims":"1 space;2 z;3 left;4 left;5 z;6 right;7 esc", //Space closes the intro, Z zooms, Left/Right turn the ship, Esc quits.
  "MarioClone":"1 d+;3 d-;3.5 space;4.5 right+;6 right-;6.5 w;7.5 esc", //Held A/D or Left/Right run, W, Space or Up jump, Esc quits.
  "Malicious Testimonies":"1 m520,280;2 lb;3 lb;4 m313,428;5 lb;8 esc", //Mouse only: the mute button, then Exit, then a key for its cleanup.
  "Ezekiel":"1 right;3 esc", //Arrows move on release, Esc quits.
  "Lord of Hosts":"1 y;2 up+;3.5 up-;4 left+;5 left-;6 space;8 esc n esc", //Y goes on, held arrows move, Space jumps, Esc then N and a key quit.
  "Solomon's Temple":"1 left;2 left;3 up;4 up;5 right;6 down;7 esc", //Arrows turn and walk, Esc quits.
  "Print format codes":"1 esc;2 esc", //Prints and returns before the script: no input.
  "Sub-integer access":"1 esc;2 esc", //Prints and returns before the script: no input.
  "Sub-switch":"1 esc;2 esc", //Prints and returns before the script: no input.
  "Null cases":"1 esc;2 esc", //Prints and returns before the script: no input.
  "Carry/branch":"1 esc;2 esc", //Prints and returns before the script: no input.
  "Word search":"1 esc;2 esc", //Prints and returns before the script: no input.
  "Phone-number words":"1 7 3 3 6 enter;3 enter", //A number and Enter print its words, an empty line returns.
  "Radix sort":"1 esc;2 esc", //Prints and returns before the script: no input.
  "Dancing Terry (sprite)":"1 space;3 esc", //Other keys go on, Esc or Shift-Esc quits.
  "Bouncing lines":"1 m200,200;2 space", //Any key quits.
  "Bounce":"1 space;3 esc", //Other keys go on, Esc or Shift-Esc quits.
  "Grid":"1 m200,200;2 m420,300;3 lb+", //The mouse plots on the grid, the left button held quits (V5.03 misses a tap).
  "Net of dots":"1 m200,200;2 space", //Any key returns.
  "Random points":"1 space;3 space", //A key draws timer seeded points, a key the seeded ones, then it prints and returns.
  "Palette":"1 space;3 space", //A key sets a gray palette, a key a white WHITE, then it returns.
  "Mouse demo":"1 m200,200;2 m420,300;3 lb", //The mouse draws, the left button quits.
  "Oh Great (song)":"1 m200,200;2 space", //Any key ends the song at its phrase's end.
  "ASCII Organ":"1 a;2 s;3 d;4 esc", //Keys sound their codes, Esc or Shift-Esc quits.
  "Water Fowl":"1 m200,200;3 space", //Any key returns.
  "Paint (click & drag)":"1 m200,200 lb+;2 m300,250;3 m400,200 lb-;4 m320,300 rb;5 esc", //The left button paints, the right button changes the color, Esc quits.
  "Hello / FizzBuzz":"1 esc;2 esc", //Prints and returns before the script: no input.
  "Mandelbrot (text)":"1 esc;2 esc", //Prints and returns before the script: no input.
  "Plasma (graphics)":"1 m200,200;2 space", //Any key quits.
  "Sierpinski":"1 m200,200;2 space", //Any key ends the drawing.
  "Scale (music)":"1 esc;2 esc", //Plays and returns before the script: no input.
  "MyProgram":"1 esc;2 esc", //Prints and returns before the script: no input.
  "God Word":"1 m200,200;2 space", //Space is OKAY on the timer pop-up, then it prints a word.
  "God Passage":"1 m200,200;2 space", //Space is OKAY on the timer pop-up, then it prints a passage.
  "God Song":"1 esc;2 esc;3 esc;4 esc;5 esc;6 esc;7 esc;8 esc m320,240 m320,240 m320,240 m320,240 m320,240 m320,240 esc m320,240 m320,240 m320,240 m320,240 m320,240 m320,240 esc m320,240 m320,240 m320,240 m320,240 m320,240 m320,240 esc m320,240 m320,240 m320,240 m320,240 m320,240 m320,240 esc m320,240 m320,240 m320,240 m320,240 m320,240 m320,240 esc m320,240 m320,240 m320,240 m320,240 m320,240 m320,240 esc m320,240 m320,240 m320,240 m320,240 m320,240 m320,240 esc m320,240 m320,240 m320,240 m320,240 m320,240 m320,240 esc m320,240 m320,240 m320,240 m320,240 m320,240 m320,240 esc", //Esc takes each of the two forms, answers each timer pop-up (a random count) and closes the song; the moves are pauses.
  "God Doodle":"1 m136,156 lb;2 space space space space;3 space space space space;4 shift+ esc shift-", //A click on OKAY, then each Space draws, Shift-Esc discards.
};
