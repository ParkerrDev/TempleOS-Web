import {EXTRA_GAMES,TERRY_DEMOS} from './game-library.js';
// Never infer authorship from the repository that happens to distribute a game.
export function gameCredits(game) {
  const extra=EXTRA_GAMES.find(g=>g.packageId===game.packageId);
  if(extra)return extra.credit;
  if(game.packageId==='toom')return {
    author:'Austin Sierra',authorUrl:'https://github.com/austings',
    source:'https://github.com/Church-of-Templeos/TOOM',
    note:'DOOM by id Software. Game data by the Freedoom contributors.',
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
    source:'https://github.com/ParkerrDev/TempleOS-Web/blob/master/games/'+game.file,
    note:'HolyC game created for TempleOS-Web.',
  };
  if(game.file==='Snake.HC')return {
    author:'ParkerrDev',authorUrl:'https://github.com/ParkerrDev',
    source:'https://github.com/ParkerrDev/TempleOS-Web/blob/master/games/Snake.HC',
    note:'HolyC game created for TempleOS-Web.',
  };
  if(game.file==='FNAF.HC')return {
    author:'ParkerrDev',authorUrl:'https://github.com/ParkerrDev',
    source:'https://github.com/ParkerrDev/TempleOS-Web/blob/master/games/FNAF.HC',
    note:'HolyC port of Five Nights at Freddy\'s by Scott Cawthon, with its images and sounds converted from the original.',
  };
  throw new Error('Missing verified game attribution: '+game.name);
}
