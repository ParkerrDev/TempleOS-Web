//Sprite Studio, in its own page (sprites.html) framed in a window.
import {WinAdd,WinRaise} from "./WinMgr.js";
import {OsInputRelease} from "./Os.js";

const CSS='    #spritesWin { width:min(1200px,96vw); padding:0; }\n'+
  '    #spritesFrame { display:block; width:100%; height:min(78vh,800px); border:0; background:white; }\n';
const HTML='  <div id="spritesOverlay" class="overlay" role="dialog" aria-modal="true" aria-label="Sprite Studio">\n'+
  '    <div class="win" id="spritesWin" data-title="Sprite Studio">\n'+
  '      <span class="close" id="spritesClose" title="Close Sprite Studio">[X]</span>\n'+
  '      <iframe id="spritesFrame" title="Sprite Studio workspace"></iframe>\n'+
  '    </div>\n'+
  '  </div>\n';
WinAdd(CSS,HTML);

const spriteOverlay = document.getElementById("spritesOverlay"), spriteFrame = document.getElementById("spritesFrame");
spriteFrame.addEventListener("load", () => {
  spriteFrame.contentDocument?.addEventListener("pointerdown", () => WinRaise(spriteOverlay));
});
const openSprites = () => {
  if (!spriteFrame.getAttribute("src")) spriteFrame.src = "sprites.html?embedded";
  spriteOverlay.classList.add("open"); WinRaise(spriteOverlay);
  OsInputRelease();
};
const closeSprites = () => {
  spriteOverlay.classList.remove("open", "free");
  spriteFrame.contentWindow?.dispatchEvent(new Event("studio-close"));
};
document.getElementById("spritesClose").addEventListener("click", closeSprites);
spriteOverlay.addEventListener("mousedown", e => { if (e.target === spriteOverlay) closeSprites(); });

export {openSprites as Open};
