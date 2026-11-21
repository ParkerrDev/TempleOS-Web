import {DEMOS} from "./Editor/Demos.js";
import {GAMES} from "./Games/GameCatalog.js";

//Every program the site runs outside the Games window, each with a play
//script in Apps/Games/GamePlays.js, checked as the Games entries are
//(Demo/Games/Test/Start.mjs, Kvm.mjs, Apps/Games/Games.browser.mjs). runs is
//where the site runs it: "editor" the editor's Run, "god" the God Tools window
//in the browser, "templeos" the God Tools' launch in TempleOS. Its source is
//path (under Apps/), then src, then call, one line each. file names its
//evidence. install, as in Games entries, is where TempleOS gets it as a file
//to run, as a user saves the editor's program to C: and runs it: a file's
//DolDoc and sprites are only its own in a file.
export const STARTER='U0 MyProgram()\n{\n  "Hello, TempleOS!\\n";\n}\n\nMyProgram;\n';
export const PROGRAMS=[
  ...DEMOS.flatMap(group=>group.items).filter((d,i,all)=>all.findIndex(e=>e.path==d.path)==i).
    map(d=>({name:d.name,file:d.path.split("/").pop(),path:"Editor/"+d.path,runs:"editor",
      install:"C:/Home/"+d.path.split("/").pop()})),
  {name:"MyProgram",file:"MyProgram.HC",src:STARTER,runs:"editor",install:"C:/Home/MyProgram.HC"},
  {name:"God Word",file:"GodWord.HC",src:"GodWord;",runs:"god",action:"word"},
  {name:"God Passage",file:"GodPassage.HC",src:"GodBiblePassage;",runs:"god",action:"passage"},
  {name:"God Song",file:"GodSong.HC",path:"God/Tools.HC",call:"GodToolSong;",runs:"templeos"},
  {name:"God Doodle",file:"GodDoodle.HC",path:"God/Tools.HC",call:"GodToolDoodle;",runs:"templeos"},
];
export const ENTRIES=[...GAMES,...PROGRAMS]; //What the play check runs, in its order.

export async function ProgramSrc(program)
{//The program's source, a byte a character.
  let res="",bytes,i;
  if (program.path) {
    const response=await fetch(new URL(program.path,import.meta.url));
    if (!response.ok)
      throw new Error("Could not load "+program.path+" ("+response.status+").");
    bytes=new Uint8Array(await response.arrayBuffer());
    for (i=0;i<bytes.length;i+=8192)
      res+=String.fromCharCode(...bytes.subarray(i,i+8192));
  }
  for (const line of [program.src,program.call])
    if (line)
      res+=(res && !res.endsWith("\n")?"\n":"")+line;
  return res;
}

function Record(name)
{//A verification record in Demo/Games, or null when it cannot load.
  return fetch(new URL("../Demo/Games/"+name+".json",import.meta.url)).
    then(function (res) {
      if (!res.ok)
        throw new Error("Verification data could not be loaded.");
      return res.json();
    }).catch(function (e) {console.warn(e.message);return null;});
}
let records=null;
export function Records()
{//Demo/Games's Compatibility, Startup and Play records, loaded once.
  return records??=Promise.all(["Compatibility","Startup","Play"].map(Record));
}

export function StartNote(s,p)
{//What Demo/Games/Startup.json and Play.json prove about one entry in TempleOS.
  if (!s || !p)
    return "TempleOS startup and play checks pending";
  if (!s.same)
    return "Starts differently here than in TempleOS V5.03";
  if (!p.verdict.templeos)
    return "Does not yet play here as in TempleOS V5.03";
  if (s.real.quit=="ignored")
    return "Starts and plays as in TempleOS V5.03, where Esc does not end it either.";
  if (s.real.run=="returned")
    return "Runs and returns as in TempleOS V5.03.";
  return "Starts, takes its keys and quits as in TempleOS V5.03.";
}

export async function Gate(entry)
{//Which runners entry's checks enable: browser and templeos are "" where it
//may run, else why not. A Games entry also needs Compatibility.json's compile
//and startup checks to run in the browser.
  const [compat,startup,play]=await Records(),
    s=startup?.games.find(s=>s.name==entry.name),p=play?.games.find(p=>p.name==entry.name),
    support=compat?.programs[entry.packageId || entry.file],program=PROGRAMS.includes(entry);
  let browser="";
  if (!program && !support?.compile)
    browser="This program has not passed the browser compiler checks.";
  else if (!program && !support.browserStartup)
    browser="This program compiles, but browser startup checks are pending.";
  else if (!p)
    browser="The browser play check of this program is pending.";
  else if (!p.verdict.browserPlays)
    browser="This program does not yet run in the browser as in TempleOS V5.03.";
  return {browser,templeos:s?.same && (s.real.run=="running" || s.real.run=="returned") &&
    p?.verdict.templeos?"":StartNote(s,p)};
}

export function Unchecked(text)
{//What an open-ended run says: the source has no play check.
  return (text?text+" ":"")+"This source has no play check: it is compiled first and runs as it is.";
}
