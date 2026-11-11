import {WinFocus} from "./WinMgr.js";
import {ArchiveDetails} from "./Archive.js";
import {TERRY_QUOTES} from "./TerryQuotes.js";

const CTX={
  frame:{name:"TempleOS",tips:[
    "Click the screen to use TempleOS. Ctrl+M opens its games menu.",
    "F1 opens TempleOS help. F5 runs the file in its editor.",
    "Esc releases a captured mouse. The Keys strip can send Esc to the OS.",
    "Drag a title or left border to move a window. Drag its right or bottom border to resize.",
    "The yellow boxes scroll the window. On a phone, swipe inside its contents.",
    "Save a snapshot in Disk & Save before leaving to keep your session."],
    actions:[["gamesBtn","Games"],["diskBtn","Save session"]]},
  gamesWin:{name:"Games",tips:[
    "Choose a game, then a supported runner. Run in TempleOS uses the OS screen.",
    "Many TempleOS games begin with a title screen. Enter or Space starts them.",
    "Edit source opens the whole program. Your draft stays local until you export it."],
    actions:[["editorBtn","HolyC editor"]]},
  editorWin:{name:"HolyC editor",tips:[
    "F5 runs the current draft. Save a copy before experimenting with a program.",
    "HolyC uses postfix casts and its own operator precedence. The source inside TempleOS is the reference.",
    "A program running in WebAssembly still needs the matching TempleOS APIs. Compilation alone does not prove compatibility."],
    actions:[["diskBtn","Disk & Save"]]},
  godWin:{name:"God Tools",tips:[
    "Word picks from the vocabulary. Passage reads a section of the King James Bible.",
    "Inside TempleOS, F7 prints a God word. GodDoodle lets you supply timing by pressing Space.",
    "Doodle runs on the OS screen. Supply timing with Space until it finishes, then press Esc to accept and save the drawing in C:/Home."],
    actions:[["godBtn","God Tools"]]},
  diskWin:{name:"Disk & Save",tips:[
    "A snapshot keeps the running machine. A disk export keeps the files on its disk.",
    "Keep an exported copy outside the browser. Browser storage can be cleared."]},
  tsWin:{name:"Terry Search",tips:[
    "Search the transcript and open a result at its timestamp. Copy passage keeps the text and its source link.",
    "Clip opens start and end times for a downloadable video section. You can adjust them before exporting.",
    "Transcript text is automatically recognized speech. Check the video before quoting it."],
    actions:[["tsBtn","Search videos"]]},
  chatWin:{name:"Chat",tips:[
    "The menu and tab count unread messages. Mute in Chat silences those notifications.",
    "Browser alerts require your browser's notification permission. Chat still works without it."],
    actions:[["chatBtn","Open Chat"]]},
  settingsWin:{name:"Settings",tips:[
    "Use 30 Hz for games that pace movement by Refresh. Uncapped rendering changes their speed.",
    "BIOS key override repeats a held key; release it or leave the page to stop." ]},
  spriteStudio:{name:"Sprite Studio",tips:[
    "TempleOS uses a fixed 16-color palette. Preview the converted sprite before exporting it."]}
};
const MENU={gamesBtn:"gamesWin",editorBtn:"editorWin",godBtn:"godWin",
  diskBtn:"diskWin",tsBtn:"tsWin",chatBtn:"chatWin",spritesBtn:"spriteStudio",settingsBtn:"settingsWin"};
let win=document.getElementById("guide"),ctx=CTX.frame,idx=0,
  game=null,player=null,sprite_pending=null,quotes=false,quote_idx=0,
  terry_clicks=0,terry_time=0;

function Visible()
{
  return !document.hidden && win.getBoundingClientRect().height>0;
}

async function SpriteStart()
{
  if (player || sprite_pending || !Visible() ||
      matchMedia("(prefers-reduced-motion:reduce)").matches)
    return;
  sprite_pending=import("./terry-sprite.js");
  try {
    player=await (await sprite_pending).playTerrySprite(
      document.getElementById("terrySprite"));
  } catch (e) {
    console.warn("Terry sprite: "+e.message);
  } finally {
    sprite_pending=null;
  }
}

function Show()
{
  let box=document.getElementById("helpActions"),action,b,
    source=document.getElementById("helpSource"),quote=TERRY_QUOTES[quote_idx];
  document.getElementById("helpContext").textContent=ctx.name;
  document.getElementById("helpLabel").textContent="Tip "+(idx+1)+
    " of "+ctx.tips.length;
  document.getElementById("helpText").textContent=ctx.tips[idx];
  source.hidden=!quotes;
  document.getElementById("helpQuotes").setAttribute("aria-pressed",String(quotes));
  document.getElementById("helpQuotes").textContent=quotes?"Context tips":"Terry quotes";
  document.getElementById("helpNext").textContent=quotes?"Next quote":"Next tip";
  if (quotes) {
    document.getElementById("helpLabel").textContent="Terry · transcript excerpt";
    document.getElementById("helpText").textContent=quote.text;
    source.textContent="Watch source · "+quote.d;
    source.href=ArchiveDetails(quote.f,quote.sec);
    source.title="Automatically transcribed; check the video before quoting.";
  }
  box.replaceChildren();
  for (action of ctx.actions || []) {
    b=document.createElement("button");
    b.type="button";
    b.textContent=action[1];
    b.dataset.target=action[0];
    b.addEventListener("click",Action);
    box.append(b);
  }
  SpriteStart();
}

function Action(e)
{
  document.getElementById(e.currentTarget.dataset.target).click();
}

function Context(id)
{
  let next=CTX[MENU[id] || id];
  if (id=="frame" && game)
    next=game;
  if (next && next!=ctx) {
    ctx=next;
    idx=0;
    quotes=false;
    Show();
  }
}

export function HelpGame(g)
{//Game controls come from the same descriptor as the launcher.
  game=null;
  if (g)
    game={name:g.name,tips:[g.how ||
      "Follow this game's on-screen instructions. Enter or Space often starts it.",
      "The Keys strip sends Esc to the game. Browser Esc releases mouse capture."]};
  Context("frame");
}

export function Open()
{
  win.style.display="";
  win.classList.add("help-open");
  WinFocus(win);
  Show();
}

function Next()
{
  if (quotes)
    quote_idx=(quote_idx+1)%TERRY_QUOTES.length;
  else
    idx=(idx+1)%ctx.tips.length;
  Show();
}

win.querySelector(".close").addEventListener("click",function () {
  win.dispatchEvent(new Event("helpclose"));
  win.classList.remove("help-open");
  win.style.display="none";
});
document.getElementById("helpNext").addEventListener("click",Next);
document.getElementById("helpQuotes").addEventListener("click",function () {
  quotes=!quotes;
  Show();
});
document.getElementById("helpTerry").addEventListener("click",async function () {
  let now=performance.now();
  if (now-terry_time>1500)
    terry_clicks=0;
  terry_time=now;
  Next();
  if (++terry_clicks==5) {
    terry_clicks=0;
    let {TerryEggs}=await import("./TerryEggs.js");
    if (Visible())
      TerryEggs(win);
  }
});
document.addEventListener("winfocus",function (e) {Context(e.detail.id);});
document.addEventListener("helpcontext",function (e) {Context(e.detail.id);});
addEventListener("resize",SpriteStart);
setInterval(function () {
  if (Visible())
    Next();
},15000);
Show();
