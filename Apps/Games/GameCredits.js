import {EXTRA_GAMES,TERRY_DEMOS} from './GameLib.js';
// Never infer authorship from the repository that happens to distribute a game.
export function gameCredits(game) {
  const extra=EXTRA_GAMES.find(g=>g.packageId===game.packageId);
  if(extra)return extra.credit;
  if(game.packageId==='after-davis')return {
    author:'ParkerrDev',authorUrl:'https://github.com/ParkerrDev',source:'https://github.com/ParkerrDev/afterdavis',
    note:'Original HolyC adventure inspired by the life and work of Terry A. Davis.',
  };
  if(game.packageId==='kings-quest')return {
    author:'Roberta Williams / Sierra On-Line',authorUrl:'https://www.sierragamers.com/',
    source:'https://archive.org/details/kings-quest-1-pcjr',
    note:'Original PCjr edition published by IBM. The HolyC player reads your local game disk.',
  };
  if(game.packageId==='toom')return {
    author:'Austin Sierra',authorUrl:'https://github.com/austings',
    source:'https://github.com/Church-of-Templeos/TOOM',
    note:'TOOM was originally created by Austin Sierra (aichrist). This TempleOS-Web version is a new HolyC implementation, using id Software\'s GPL DOOM rules and Freedoom\'s maps, art and sounds.',
  };
  if(TERRY_DEMOS.some(name=>game.packageId==='tinker-'+name))return {
    author:'Terry A. Davis',authorUrl:'https://templeos.org/',
    source:'https://github.com/cia-foundation/TempleOS/tree/c26482bb6ad3f80106d28504ec5db3c6a360732c/Demo/Games/'+(game.name==='Stadium'?'Stadium':game.name+'.HC'),
    note:'Original TempleOS game. This version is maintained by TheTinkerer in TinkerOS.',
  };
  if(game.file==='HolyCraft.HC')return {
    author:'ParkerrDev',authorUrl:'https://github.com/ParkerrDev',
    source:'https://github.com/ParkerrDev/HolyCraft',
    note:'HolyC game created for TempleOS-Web.',
  };
  if(['Babel.HC','Volley.HC'].includes(game.file))return {
    author:'ParkerrDev',authorUrl:'https://github.com/ParkerrDev',
    source:'https://github.com/ParkerrDev/TempleOS-Web/blob/master/Demo/Games/'+game.file,
    note:'HolyC game created for TempleOS-Web.',
  };
  if(game.file==='Snake.HC')return {
    author:'ParkerrDev',authorUrl:'https://github.com/ParkerrDev',
    source:'https://github.com/ParkerrDev/TempleOS-Web/blob/master/Demo/Games/Snake.HC',
    note:'HolyC game created for TempleOS-Web.',
  };
  if(game.file==='FNAF.HC')return {
    author:'ParkerrDev',authorUrl:'https://github.com/ParkerrDev',
    source:'https://github.com/ParkerrDev/TempleOS-Web/blob/master/Demo/Games/FNAF.HC',
    note:'HolyC port of Five Nights at Freddy\'s by Scott Cawthon, with its images and sounds converted from the original.',
  };
  throw new Error('Missing verified game attribution: '+game.name);
}
