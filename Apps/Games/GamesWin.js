import {gameCredits} from './GameCredits.js';
import {GAMES} from './GameCatalog.js';
export {GAMES} from './GameCatalog.js';
import {WinAdd,WinRaise,WinOrigin} from '../../Adam/WinMgr.js';
import {OsInputRelease} from '../../Adam/Os.js';
import {Gate,Records} from '../Programs.js';
const CSS=`
    .gm-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(min(230px,100%),1fr)); gap:10px; padding:4px 2px; }
    .gm-card { background:#fff; border:3px double var(--blue); color:var(--blue); padding:10px; display:flex; flex-direction:column; gap:8px; }
    .gm-card h3 { font-size:14px; font-weight:normal; color:var(--red); }
    .gm-card p { font-size:12px; line-height:1.3; }
    .gm-card .gm-desc { flex:1; }
    .gm-credit a,.gm-details a,.gm-intro a { color:var(--blue); text-decoration:underline; }
    .gm-btns { display:grid; grid-template-columns:1fr 1fr; gap:6px; }
    .gm-card .gm-play,.gm-card .gm-edit { width:100%; min-width:0; height:auto; padding:5px 4px; font-size:11px; line-height:1.2; text-align:center; white-space:normal; }
    .gm-card .gm-edit { grid-column:1/-1; }
    .gm-details { font-size:12px; line-height:1.3; }
    .gm-details summary { cursor:pointer; width:fit-content; }
    .gm-details summary:focus-visible { outline:2px solid var(--blue); outline-offset:2px; }
    .gm-details[open] summary { margin-bottom:8px; }
    .gm-details:not([open])>:not(summary) { display:none; }
    .gm-details p+p { margin-top:8px; }
    #gamesWin { display:flex; flex-direction:column; width:min(880px,92vw); max-height:calc(100vh - 84px); }
    .gm-intro { display:flex; flex-wrap:wrap; justify-content:space-between; gap:6px 16px; flex:0 0 auto; padding:2px 2px 10px; color:var(--blue); font-size:12px; line-height:1.3; }
    .gm-search { flex:0 0 auto; box-sizing:border-box; width:100%; margin:2px 0 8px; padding:5px 9px; font-family:inherit; font-size:13px; background:#fff; color:var(--blue); border:3px double var(--blue); outline:none; }
    .gm-search::placeholder { color:var(--dkgray); }
    .gm-scroll { flex:1 1 auto; min-height:0; overflow-y:auto; overflow-x:hidden; padding-right:2px; }
    .gm-none { color:var(--red); font-size:13px; padding:14px 4px; }
    .gm-card.gm-hide { display:none; }
`;
const HTML=`
  <div id="gamesOverlay" class="overlay" role="dialog" aria-modal="true" aria-label="Games">
    <div class="win" id="gamesWin" data-title="Games">
      <span class="close" id="gamesClose" title="Close">[X]</span>
      <div class="gm-intro">
        <p>Play in your browser or in TempleOS.</p>
        <a data-game-submit href="https://github.com/ParkerrDev/TempleOS-Web/issues/new" target="_blank" rel="noopener">Submit a game</a>
      </div>
      <input type="search" id="gmSearch" class="gm-search" placeholder="Search games…" autocomplete="off" spellcheck="false" aria-label="Search games">
      <div class="gm-scroll">
        <p id="gmLoading" role="status">Loading games…</p>
        <div class="gm-grid" id="gmGrid"></div>
        <div class="gm-none" id="gmNone" hidden>No games match your search.</div>
      </div>
    </div>
  </div>
`;
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
let startup=null;
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
[,startup]=await Records();
for (const g of GAMES) {
  const c = document.createElement("div"); c.className = "gm-card";
  c.innerHTML = `<h3>${g.name}</h3><p class="gm-desc">${g.blurb}</p>`;
  const credit=gameCredits(g),by=document.createElement('p');by.className='gm-credit';
  const link=(text,url)=>{const a=document.createElement('a');a.textContent=text;a.href=url;a.target='_blank';a.rel='noopener';return a;};
  by.append('By ',link(credit.author,credit.authorUrl));
  c.append(by);
  const row = document.createElement("div"); row.className = "gm-btns";
  const bB=document.createElement("button");bB.className="gm-play";bB.textContent="Browser";bB.setAttribute("aria-label","Run in Browser");
  bB.title="Compile HolyC directly to WebAssembly";
  const gate=await Gate(g);
  if (gate.browser) {
    bB.disabled=true;
    bB.textContent="Browser pending";
    bB.title=gate.browser;
  }
  bB.addEventListener("click",e=>Run("runInBrowser",g,e.currentTarget));row.append(bB);
  const bT=document.createElement("button");bT.className="gm-play";bT.textContent="TempleOS";bT.setAttribute("aria-label","Run in TempleOS");
  bT.title="Install and launch in TempleOS V5.03, running in HEMU.";
  if (gate.templeos) {
    bT.disabled=true;
    bT.textContent="TempleOS pending";
    bT.title=gate.templeos;
  }
  bT.addEventListener("click",e=>Run("runInTempleOS",g,e.currentTarget));row.append(bT);
  const edit=document.createElement("button");edit.className="gm-edit";edit.textContent="Edit source";
  edit.addEventListener("click",e=>Run("editGame",g,e.currentTarget));row.append(edit);
  c.appendChild(row);grid.appendChild(c);
  const details=document.createElement("details");details.className="gm-details";
  const summary=document.createElement("summary");summary.textContent="Details";
  const note=document.createElement("p");note.textContent=credit.note;
  const source=document.createElement("p");source.append(link("Original source",credit.source));
  details.append(summary,note,source);
  if (g.how) {
    const controls=document.createElement("p");controls.textContent=g.how;
    details.append(controls);
  }
  c.append(details);
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
  const label=button.textContent,origin=WinOrigin(button);
  button.disabled=true;button.textContent="Opening…";
  try {await (await import("./GamesRun.js"))[action](game,{origin});}
  catch(e) {document.getElementById("gmLoading").hidden=false;document.getElementById("gmLoading").textContent="Could not open game: "+e.message;}
  finally {button.disabled=false;button.textContent=label;}
}
function openGames() { loading??=CardsLoad(); ovG.classList.add("open"); OsInputRelease(); WinRaise(ovG);
  setTimeout(() => { try { gmSearch.focus(); gmSearch.select(); } catch {} }, 0); }
function closeGames() { ovG.classList.remove("open"); }
document.getElementById("gamesClose").addEventListener("click", closeGames);
ovG.addEventListener("mousedown", (e) => { if (e.target === ovG) closeGames(); });
export {openGames as Open,closeGames as Close};
