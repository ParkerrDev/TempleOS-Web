import {WinFocus} from "./WinMgr.js";

const CTX={
  frame:{name:"TempleOS",tips:[
    "Click the screen to use TempleOS. Ctrl+M opens its games menu.",
    "F1 opens TempleOS help. F5 runs the file in its editor.",
    "Esc releases a captured mouse. The Keys strip can send Esc to the OS.",
    "Drag a title or left border to move a window. Drag its right or bottom border to resize.",
    "The yellow boxes scroll the window. On a phone, swipe inside its contents.",
    "Save a snapshot in Disk & Save before leaving to keep your session."]},
  gamesWin:{name:"Games",tips:[
    "Choose a game, then a supported runner. Run in TempleOS uses the OS screen.",
    "Many TempleOS games begin with a title screen. Enter or Space starts them.",
    "Edit source opens the whole program. Your draft stays local until you export it."]},
  editorWin:{name:"HolyC editor",tips:[
    "F5 runs the current draft. Save a copy before experimenting with a program.",
    "HolyC uses postfix casts and its own operator precedence. The source inside TempleOS is the reference.",
    "A program running in WebAssembly still needs the matching TempleOS APIs. Compilation alone does not prove compatibility."]},
  godWin:{name:"God Tools",tips:[
    "Word picks from the vocabulary. Passage reads a section of the King James Bible.",
    "Inside TempleOS, F7 prints a God word. GodDoodle lets you supply timing by pressing Space.",
    "Doodle runs on the OS screen. Supply timing with Space until it finishes, then press Esc to accept and save the drawing in C:/Home."]},
  diskWin:{name:"Disk & Save",tips:[
    "A snapshot keeps the running machine. A disk export keeps the files on its disk.",
    "Keep an exported copy outside the browser. Browser storage can be cleared."]},
  tsWin:{name:"Terry Search",tips:[
    "Search the transcript and open a result at its timestamp. Copy passage keeps the text and its source link.",
    "Clip opens start and end times for a downloadable video section. You can adjust them before exporting.",
    "Transcript text is automatically recognized speech. Check the video before quoting it."]},
  chatWin:{name:"Chat",tips:[
    "The menu and tab count unread messages. Mute in Chat silences those notifications.",
    "Browser alerts require your browser's notification permission. Chat still works without it."]},
  settingsWin:{name:"Settings",tips:[
    "Use 30 Hz for games that pace movement by Refresh. Uncapped rendering changes their speed.",
    "BIOS key override repeats a held key; release it or leave the page to stop." ]},
  spriteStudio:{name:"Sprite Studio",tips:[
    "TempleOS uses a fixed 16-color palette. Preview the converted sprite before exporting it."]}
};
const MENU={gamesBtn:"gamesWin",editorBtn:"editorWin",godBtn:"godWin",
  diskBtn:"diskWin",tsBtn:"tsWin",chatBtn:"chatWin",spritesBtn:"spriteStudio",settingsBtn:"settingsWin"};
let win=document.getElementById("guide"),ctx=CTX.frame,idx=0,game=null;

function Visible()
{
  return !document.hidden && win.getBoundingClientRect().height>0;
}

function Show()
{
  document.getElementById("helpContext").textContent=ctx.name;
  document.getElementById("helpLabel").textContent="Tip "+(idx+1)+
    " of "+ctx.tips.length;
  document.getElementById("helpText").textContent=ctx.tips[idx];
  document.getElementById("helpNext").hidden=ctx.tips.length<2;
}

function Context(id)
{
  let next=CTX[MENU[id] || id];
  if (id=="frame" && game)
    next=game;
  if (next && next!=ctx) {
    ctx=next;
    idx=0;
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
  if (win._reopen)
    win._reopen.style.display="none";
  win.classList.add("help-open");
  WinFocus(win);
  Show();
}

function Next()
{
  idx=(idx+1)%ctx.tips.length;
  Show();
}

win.querySelector(".close").addEventListener("click",function () {
  win.classList.remove("help-open");
  win.style.display="none";
});
document.getElementById("helpNext").addEventListener("click",Next);
document.addEventListener("winfocus",function (e) {Context(e.detail.id);});
document.addEventListener("helpcontext",function (e) {Context(e.detail.id);});
setInterval(function () {
  if (Visible())
    Next();
},15000);
Show();
