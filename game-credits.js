// Credits follow the original source trees, rather than the browser adapters.
export function gameCredits(game) {
  if(game.packageId==='toom')return {
    author:'Austin Sierra',authorUrl:'https://github.com/austings',
    source:'https://github.com/Church-of-Templeos/TOOM',
    note:'DOOM by id Software. Game data by the Freedoom contributors.',
  };
  if(game.packageId){
    const path=game.name==='Stadium'?'Stadium/Stadium.HC':game.name+'.HC';
    return {
      author:'Terry A. Davis',authorUrl:'https://templeos.org/',
      source:'https://github.com/tinkeros/TinkerOS/blob/main/Demo/Games/'+path,
      note:'Original TempleOS game, maintained in TinkerOS.',
    };
  }
  return {
    author:'ParkerrDev',authorUrl:'https://github.com/ParkerrDev',
    source:'https://github.com/ParkerrDev/TempleOS-Web/blob/main/games/'+game.file,
    note:'HolyC game created for TempleOS-Web.',
  };
}
