import {gameCredits} from './GameCredits.js';
import {GAMES} from './GameCatalog.js';
export {GAMES} from './GameCatalog.js';
import {WinAdd,WinRaise} from '../../Adam/WinMgr.js';
import {OsInputRelease} from '../../Adam/Os.js';
const CSS='    /* ---- Games launcher ---- */\n'+
  '    .gm-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(230px,1fr)); gap:12px; padding:6px 2px; }\n'+
  '    .gm-card { background:#fff; border:3px double var(--blue); color:var(--blue); padding:10px; display:flex; flex-direction:column; gap:6px; }\n'+
  '    .gm-card h3 { font-size:14px; font-weight:normal; color:var(--red); }\n'+
  '    .gm-card p { font-size:12px; line-height:1.1; flex:1 1 auto; }\n'+
  '    .gm-card .gm-credit { flex:0 0 auto; line-height:1.3; }\n'+
  '    .gm-credit a { color:var(--blue); text-decoration:underline; }\n'+
  '    .gm-btns { display:flex; flex-direction:column; gap:6px; }\n'+
  '    .gm-card .gm-play { width:100%; align-self:stretch; text-align:center; white-space:normal; font-size:11px; line-height:1.2; padding:5px 4px; height:auto; }\n'+
  '    /* the Games window is a fixed-size dialog: search box on top, the grid scrolls below it */\n'+
  '    #gamesWin { display:flex; flex-direction:column; width:min(880px,92vw); max-height:calc(100vh - 84px); }\n'+
  '    .gm-search { flex:0 0 auto; box-sizing:border-box; width:100%; margin:2px 0 8px; padding:5px 9px;\n'+
  '                 font-family:inherit; font-size:13px; background:#fff; color:var(--blue); border:3px double var(--blue); outline:none; }\n'+
  '    .gm-search::placeholder { color:var(--dkgray); }\n'+
  '    .gm-scroll { flex:1 1 auto; min-height:0; overflow-y:auto; overflow-x:hidden; padding-right:2px; }\n'+
  '    .gm-none { color:var(--red); font-size:13px; padding:14px 4px; }\n'+
  '    .gm-card.gm-hide { display:none; }   /* search filter (beats .gm-card\'s display:flex) */\n'+
  '    .game-submit { flex:0 0 auto; margin:2px 2px 8px; padding:4px 8px 12px; border-bottom:3px double var(--blue); color:var(--blue); text-align:left; }\n'+
  '    .game-submit h2 { font-size:14px; font-weight:normal; color:var(--red); margin-bottom:8px; }\n'+
  '    .game-submit p { font-size:12px; line-height:1.4; max-width:72ch; margin-bottom:10px; }\n'+
  '    .game-submit-link { display:inline-block; max-width:100%; padding:7px 9px; border:2px solid var(--blue); background:var(--blue); color:#fff; font-size:12px; line-height:1.3; text-decoration:none; }\n'+
  '    .game-submit-link:hover, .game-submit-link:focus-visible { background:#fff; color:var(--blue); outline:2px solid var(--blue); outline-offset:2px; }\n';
const HTML='  <div id="gamesOverlay" class="overlay" role="dialog" aria-modal="true" aria-label="Games">\n'+
  '    <div class="win" id="gamesWin" data-title="Games">\n'+
  '      <span class="close" id="gamesClose" title="Close">[X]</span>\n'+
  '      <section class="game-submit" id="gameSubmit" aria-labelledby="gameSubmitTitle">\n'+
  '        <h2 id="gameSubmitTitle">Have a TempleOS or HolyC game?</h2>\n'+
  '        <p>Share your game for a chance to be featured here. Include a link to the source code, how to run it, and the author name and link we should credit. Screenshots or a gameplay clip help us see it in action.</p>\n'+
  '        <p>Tell us the license or permission for sharing the code and game assets. Submissions are reviewed before being added.</p>\n'+
  '        <a class="game-submit-link" data-game-submit href="https://github.com/ParkerrDev/TempleOS-Web/issues/new" target="_blank" rel="noopener">Submit your game on GitHub</a>\n'+
  '      </section>\n'+
  '      <input type="search" id="gmSearch" class="gm-search" placeholder="Search games…" autocomplete="off" spellcheck="false" aria-label="Search games">\n'+
  '      <div class="gm-scroll">\n'+
  '        <p id="gmLoading" role="status">Loading games…</p>\n'+
  '        <div class="gm-grid" id="gmGrid"></div>\n'+
  '        <div class="gm-none" id="gmNone" hidden>No games match your search.</div>\n'+
  '      </div>\n'+
  '    </div>\n'+
  '  </div>\n';
WinAdd(CSS,HTML);

const submission=new URL('https://github.com/ParkerrDev/TempleOS-Web/issues/new');
submission.searchParams.set('title','Game submission: ');
submission.searchParams.set('body',`## Game name

## About the game

## Author name and credit link

## Original source code URL

## How to run
Include the TempleOS or HolyC version, entry file, dependencies and controls.

## Screenshots or gameplay clip

## License or permission to share
Cover both the source code and any game assets.
`);
for(const link of document.querySelectorAll('[data-game-submit]'))link.href=submission.href;

const ovG=document.getElementById("gamesOverlay"),grid=document.getElementById("gmGrid");
const cards = [];
function Record(name)
{//A verification record in Demo/Games, or null when it cannot load.
  return fetch(new URL("../../Demo/Games/"+name+".json",import.meta.url)).
    then(function (res) {
      if (!res.ok)
        throw new Error("Game verification data could not be loaded.");
      return res.json();
    }).catch(function (e) {console.warn(e.message);return null;});
}
let evidence=null,startup=null;
function StartNote(s)
{//What Demo/Games/Startup.json proves about one entry.
  if (!s)
    return "TempleOS startup check pending";
  if (!s.same)
    return "Starts differently here than in TempleOS V5.03";
  if (s.real.quit=="ignored")
    return "Starts as in TempleOS V5.03, where Esc does not end it either. Gameplay not yet compared.";
  if (s.real.run=="running")
    return "Starts and quits as in TempleOS V5.03. Gameplay not yet compared.";
  return "Ends as in TempleOS V5.03 ("+s.real.run+"). Gameplay not yet compared.";
}
export function QuitNote(g)
{//The key that ended this entry in TempleOS V5.03.
  const s=startup?.games.find(s=>s.name==g.name);
  if (s?.real.quit=="shift-esc")
    return "Press <b>Shift+Esc</b> to quit.";
  if (s?.real.quit=="ignored")
    return "Esc does not end it in TempleOS either: use its own controls.";
  return "Press <b>Esc</b> to quit.";
}
async function CardsLoad() {
[evidence,startup]=await Promise.all([Record("Compatibility"),Record("Startup")]);
for (const g of GAMES) {
  const c = document.createElement("div"); c.className = "gm-card";
  c.innerHTML = `<h3>${g.name}</h3><p>${g.blurb}</p>`;
  const credit=gameCredits(g),by=document.createElement('p');by.className='gm-credit';
  const link=(text,url)=>{const a=document.createElement('a');a.textContent=text;a.href=url;a.target='_blank';a.rel='noopener';return a;};
  by.append('By ',link(credit.author,credit.authorUrl),'. '+credit.note+' ',link('Original source code',credit.source));
  c.append(by);
  const row = document.createElement("div"); row.className = "gm-btns";
  const bB=document.createElement("button");bB.className="gm-play";bB.textContent="Run in Browser";
  bB.title="Compile HolyC directly to WebAssembly";
  const support=evidence?.programs[g.packageId || g.file];
  if (!support?.compile || !support?.browserStartup) {
    bB.disabled=true;
    bB.textContent="Browser support pending";
    bB.title=support?.compile ? "This program compiles, but browser startup checks are pending." :
      "This program has not passed the browser compiler checks.";
  }
  bB.addEventListener("click",e=>Run("runInBrowser",g,e.currentTarget));row.append(bB);
  const bT=document.createElement("button");bT.className="gm-play";bT.textContent="Run in TempleOS";
  const started=startup?.games.find(s=>s.name==g.name);
  bT.title="Install and launch in TempleOS V5.03, running in HEMU.";
  if (!started?.same || started.real.run!="running" && started.real.run!="returned") {
    bT.disabled=true;
    bT.textContent="TempleOS support pending";
    bT.title=StartNote(started);
  }
  bT.addEventListener("click",e=>Run("runInTempleOS",g,e.currentTarget));row.append(bT);
  const edit=document.createElement("button");edit.textContent="Edit source";
  edit.addEventListener("click",e=>Run("editGame",g,e.currentTarget));row.append(edit);
  c.appendChild(row);grid.appendChild(c);
  const note=document.createElement("small");
  note.textContent=StartNote(started);
  c.append(note);
  cards.push({ el: c, hay: (g.name + " " + g.blurb+' '+credit.author).toLowerCase() });
}
document.getElementById("gmLoading").hidden=true;
filterGames();
}
// ---- live search: filter the cards by name/description as you type ----
const gmSearch = document.getElementById("gmSearch"), gmNone = document.getElementById("gmNone");
const filterGames = () => {
  const q = gmSearch.value.trim().toLowerCase(); let shown = 0;
  for (const { el, hay } of cards) { const ok = !q || hay.includes(q); el.classList.toggle("gm-hide", !ok); if (ok) shown++; }
  gmNone.hidden = shown > 0;
};
gmSearch.addEventListener("input", filterGames);
gmSearch.addEventListener("keydown", (e) => { if (e.key === "Escape") { if (gmSearch.value) { gmSearch.value = ""; filterGames(); e.stopPropagation(); } } });

let loading;
async function Run(action,game,button)
{
  const label=button.textContent;
  button.disabled=true;button.textContent="Opening…";
  try {await (await import("./GamesRun.js"))[action](game);}
  catch(e) {document.getElementById("gmLoading").hidden=false;document.getElementById("gmLoading").textContent="Could not open game: "+e.message;}
  finally {button.disabled=false;button.textContent=label;}
}
function openGames() { loading??=CardsLoad(); ovG.classList.add("open"); OsInputRelease(); WinRaise(ovG);
  setTimeout(() => { try { gmSearch.focus(); gmSearch.select(); } catch {} }, 0); }
function closeGames() { ovG.classList.remove("open"); }
document.getElementById("gamesClose").addEventListener("click", closeGames);
ovG.addEventListener("mousedown", (e) => { if (e.target === ovG) closeGames(); });
export {openGames as Open,closeGames as Close};
