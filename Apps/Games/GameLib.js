// Explicit provenance: a file living in TinkerOS does not establish its author.
export const TERRY_DEMOS = 'BattleLines BigGuns BlackDiamond BomberGolf CastleFrankenstein CharDemo CircleTrace Collision Digits DunGen ElephantWalk FlapBat FlatTops Halogen MassSpring Maze RainDrops RawHide Rocket RocketScience Squirt Stadium Talons TheDead TicTacToe TreeCheckers Varoom Wenceslas Whap Zing ZoneOut'.split(' ');
const terry={author:'Terry A. Davis',authorUrl:'https://templeos.org/'};
const tinkerer={author:'TheTinkerer',authorUrl:'https://github.com/tinkeros'};
const austin={author:'Austin Sierra',authorUrl:'https://github.com/austings'};
export const EXTRA_GAMES = [
  ...[
    ['AfterEgypt','An interactive journey through Egypt, with stories and oracle tools.'],
    ['Chess','Play chess against the computer.'],
    ['KeepAway','Keep the ball away from the opposing players.'],
    ['Span','Build a bridge and test its strength.'],
    ['Strut','Build and experiment with mechanical structures.'],
    ['Titanium','A scrolling tank combat game.'],
    ['ToTheFront','Command units in a tactical battlefield.'],
    ['Vocabulary','Test your vocabulary with a word quiz.'],
    ['X-Caliber','Fly and fight in a scrolling space shooter.'],
  ].map(([name,blurb])=>({name,blurb,group:'TinkerOS',folder:'Apps/'+name,entry:'Run.HC',credit:{...terry,source:['AfterEgypt','Chess'].includes(name)?'https://templeos.org/Downloads/TOS_Supplemental1.ISO.C':'https://github.com/cia-foundation/TempleOS/tree/c26482bb6ad3f80106d28504ec5db3c6a360732c/Apps/'+name,note:'Original TempleOS game. This version is maintained by TheTinkerer in TinkerOS.'}})),
  ...[
    ['CF2','CF2.HC','Castle Frankenstein 2','Explore a larger castle with new enemies and combat.','TinkerOS sequel by TheTinkerer, based on Terry A. Davis\'s Castle Frankenstein.','CF2'],
    ['Cube','Run.HC','Cube','Solve a rotating 3D cube puzzle.','','cube'],
    ['GlowUFOs','GlowUFOs.HC','GlowUFOs','Defend the landscape from descending UFOs.','',''],
    ['OT1975','Run.HC','Oregon Trail 1975','Lead a wagon party west in the classic text adventure.','HolyC port by TheTinkerer. Original by MECC staff, with 1975 revisions by Don Rawitsch.','OT1975'],
    ['Scorch','Scorch.HC','Scorch','Trade artillery shots across destructible terrain.','',''],
    ['SpyHunt','Run.HC','SpyHunt','Race down the road, rescue allies and battle spies.','TinkerOS game by TheTinkerer, based on Terry A. Davis\'s Titanium.','SpyHunt'],
    ['Sudoku','Run.HC','Sudoku','Solve generated number puzzles with hints and saved best times.','','Sudoku'],
    ['Tetris','Tetris.HC','Tetris','Stack falling blocks and clear lines.','HolyC implementation by TheTinkerer. Tetris was created by Alexey Pajitnov.',''],
  ].map(([folder,entry,name,blurb,note,repo])=>({name,blurb,group:'TinkerOS',folder:'Apps/'+folder,entry,credit:{...tinkerer,source:repo?'https://github.com/tinkeros/'+repo:'https://github.com/tinkeros/TinkerOS/tree/main/Apps/'+folder,note:note||'An original TinkerOS game by TheTinkerer.'}})),
  ...[
    ['B17','Fly a bomber and drop bombs.'],
    ['Coach','Time your swing in a tee-ball batting game.'],
    ['DiningStars','Explore a restaurant in this 3D game.'],
    ['Flappy','Keep a bird flying through the gaps.'],
    ['MissileDefense','Defend the ground against incoming missiles.'],
    ['Rocks','Pilot a ship through an asteroid field.'],
    ['Pilgrims','Explore New England in Terry\'s settlement game.'],
  ].map(([name,blurb])=>({name,blurb,group:'TerrySupplement',folder:name==='Pilgrims'?'Pilgrims':name+'.HC',entry:name+'.HC',credit:{...terry,source:'https://templeos.org/Downloads/TOS_Supplemental1.ISO.C',note:'From Terry\'s official TempleOS Supplemental 1 disc.'+(name==='Pilgrims'?' Map derived from the US Geological Survey.':'')}})),
  {name:'MarioClone',blurb:'A side-scrolling platform game in HolyC.',group:'MarioClone',folder:'.',entry:'Main.HC',credit:{...austin,source:'https://github.com/austings/MarioClone',note:'HolyC game by Austin Sierra. Mario characters and original game by Nintendo.'}},
  {name:'Malicious Testimonies',blurb:'A HolyC role-playing game with exploration, character creation and combat.',group:'MaliciousTestimonies',folder:'.',entry:'Load.HC',credit:{...austin,source:'https://github.com/austings/MaliciousTestimonies',note:'HolyC RPG by Austin Sierra. TempleOS edition runs offline; multiplayer requires the upstream Aiwnios environment.'}},
  {name:'Ezekiel',blurb:'Austin Sierra\'s early TempleOS game from the Ezekiel disc.',group:'AustinArchive',folder:'Ezekiel',entry:'Sinner.HC',credit:{...austin,source:'https://github.com/austings/GamesMirror/blob/main/Ezekiel.ISO_.zip',note:'Original HolyC source and sprites recovered from the author\'s game disc.'}},
  {name:'Lord of Hosts',blurb:'A 3D TempleOS adventure with animated characters.',group:'AustinArchive',folder:'LordOfHosts',entry:'Load.HC',credit:{...austin,source:'https://github.com/austings/GamesMirror/blob/main/LordofHostsv3.ISO_(1).zip',note:'Original HolyC source and sprites recovered from the author\'s game disc.'}},
  {name:'Solomon\'s Temple',blurb:'Explore a 3D temple with an interactive oracle.',group:'AustinArchive',folder:'Temple',entry:'cellar.HC',credit:{...austin,source:'https://github.com/austings/GamesMirror/blob/main/Temple.ISO_.C(1).zip',note:'Original HolyC source and sprites recovered from the author\'s game disc.'}},
].map(game=>({...game,packageId:'library-'+game.name.replace(/[^A-Za-z0-9]/g,''),disk:'C:/Home/Games/'+game.group+'/'+(game.folder==='.'?'':game.folder.replace(/\.HC$/,'')+'/')+'BrowserStart.HC'}));
