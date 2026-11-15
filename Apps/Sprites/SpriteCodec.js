import {PALETTE} from "../../Adam/FrameBuf.js";
export {PALETTE};
export const MAX_PIXELS=20_000_000;
export const MAX_FRAMES=600;

export const SPRITE_PLAYER=new URL("./Play.HC",import.meta.url);
export function spritePackage(codec,frames, width, height, delayMs,playerSource) {
  if (typeof playerSource!="string") throw new Error("The native sprite player is missing.");
  const enc = new TextEncoder();
  const files = frames.map((f,i)=>({name:`Frame${String(i).padStart(3,'0')}.GR`,bytes:f}));
  files.push({name:'Play.HC',bytes:enc.encode(
    `#define SPRITE_COUNT ${frames.length}\n#define SPRITE_DELAY ${delayMs}\n`+playerSource)});
  files.push({name:'README.TXT',bytes:enc.encode('Copy this folder to TempleOS, then include Play.HC. Press a key to stop.\nFor a reusable sprite: CDC *dc=GRRead("Frame000.GR"); U8 *sprite=DC2Sprite(dc); Sprite(,x,y,sprite);\nFree(sprite); DCDel(dc);\n')});
  files.push({name:'animation.json',bytes:enc.encode(JSON.stringify({width,height,frames:frames.length,delayMs,palette:'TempleOS standard',transparent:255},null,2))});
  return codec.zipFiles(files);
}
