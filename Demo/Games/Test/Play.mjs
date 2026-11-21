import assert from "node:assert/strict";
import {mkdir,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {deflateSync} from "node:zlib";
import {PLAYS} from "../../../Apps/Games/GamePlays.js";

//The play check: Apps/Games/GamePlays.js's scripts as the timed events each
//machine runs, the frames it snaps, and what a run and three machines show.
//Start.HC (V5.03), Catalog.mjs (HEMU) and Games.browser.mjs (HolyC-WASM) all
//take their events from PlayEvents and their frames through FrameSnap.

//Set-1 make codes (0x100 marks the E0 prefix) and the browser's KeyboardEvent.code.
export const KEYS={esc:[0x01,"Escape"],minus:[0x0C,"Minus"],equal:[0x0D,"Equal"],
  bs:[0x0E,"Backspace"],tab:[0x0F,"Tab"],lbracket:[0x1A,"BracketLeft"],
  rbracket:[0x1B,"BracketRight"],enter:[0x1C,"Enter"],ctrl:[0x1D,"ControlLeft"],
  semicolon:[0x27,"Semicolon"],quote:[0x28,"Quote"],grave:[0x29,"Backquote"],
  shift:[0x2A,"ShiftLeft"],backslash:[0x2B,"Backslash"],comma:[0x33,"Comma"],
  dot:[0x34,"Period"],slash:[0x35,"Slash"],alt:[0x38,"AltLeft"],space:[0x39,"Space"],
  f11:[0x57,"F11"],f12:[0x58,"F12"],home:[0x147,"Home"],up:[0x148,"ArrowUp"],
  pgup:[0x149,"PageUp"],left:[0x14B,"ArrowLeft"],right:[0x14D,"ArrowRight"],
  end:[0x14F,"End"],down:[0x150,"ArrowDown"],pgdn:[0x151,"PageDown"],
  ins:[0x152,"Insert"],del:[0x153,"Delete"]};
"1234567890".split("").forEach((ch,i)=>KEYS[ch]=[0x02+i,"Digit"+ch]);
["qwertyuiop","asdfghjkl","zxcvbnm"].forEach((row,j)=>row.split("").forEach((ch,i)=>
  KEYS[ch]=[[0x10,0x1E,0x2C][j]+i,"Key"+ch.toUpperCase()]));
for (let i=1;i<=10;i++)
  KEYS["f"+i]=[0x3A+i,"F"+i];

export const MS_START=[320,240]; //Where every machine puts the mouse before the launch.
export const PLAY_TAP=100,PLAY_GAP=50; //ms a tap is held, ms after each action.
export const THUMB_W=16,THUMB_H=12,GR_W=640,GR_H=480;
export const FRAME_TOP=8; //Text row 0, TempleOS's status line with its clock, is not hashed.

export function KeyBytes(name,down)
{//The set-1 bytes a key sends.
  const code=KEYS[name][0],sc=code&0x7F|(down?0:0x80);
  return code&0x100?[0xE0,sc]:[sc];
}

export function PlaySteps(script)
{//"T ACT...;T ACT..." as [{t,acts}], t in ms, checked against the grammar.
  const steps=script.split(";").map(function (step) {
    const [t,...acts]=step.trim().split(/\s+/);
    assert(/^\d+(\.\d+)?$/.test(t),"Bad step time: "+step);
    for (const act of acts)
      assert(/^m\d+,\d+$/.test(act) && +act.slice(1).split(",")[0]<GR_W &&
        +act.split(",")[1]<GR_H || /^[lr]b[+-]?$/.test(act) ||
        KEYS[act.replace(/[+-]$/,"")],"Bad action: "+act);
    assert(acts.length,"Empty step: "+step);
    return {t:Math.round(+t*1000),acts};
  });
  assert(steps[0].t>=1000,"The first step comes 1 s in at the earliest.");
  steps.forEach((s,i)=>assert(!i || s.t-steps[i-1].t>=500,"Steps are 0.5 s apart: "+script));
  assert(steps.length>=2 && steps.length<=8,"2 to 8 steps: "+script);
  return steps;
}

export function PlayEvents(name,kind)
{//The timed events of one run: kind "play" plays the script, "control" only snaps
//at its times and then quits as the startup check does. Each event names the
//stage it belongs to, so a run that ends there says which input ended it.
  const steps=PlaySteps(PLAYS[name]),res=[],ms={x:MS_START[0],y:MS_START[1],l:0,r:0};
  let t;
  function Key(key,down,stage) {res.push({t,op:"key",key,down,stage});}
  function Ms(stage) {res.push({t,op:"ms",...ms,stage});}
  function Act(act,stage)
  {
    const hold=act.at(-1)=="+" || act.at(-1)=="-",name=hold?act.slice(0,-1):act;
    if (act[0]=="m") {
      [ms.x,ms.y]=act.slice(1).split(",").map(Number);
      Ms(stage);
    } else if (name=="lb" || name=="rb") {
      ms[name[0]]=hold?+(act.at(-1)=="+"):1;
      Ms(stage);
      if (!hold) {
        t+=PLAY_TAP;
        ms[name[0]]=0;
        Ms(stage);
      }
    } else {
      Key(name,!hold || act.at(-1)=="+",stage);
      if (!hold) {
        t+=PLAY_TAP;
        Key(name,false,stage);
      }
    }
    t+=PLAY_GAP;
  }
  function Quit(keys,stage)
  {
    keys.forEach(act=>Act(act,stage));
    res.push({t,op:"quit",stage});
  }
  t=0;
  res.push({t,op:"snap",stage:"play"});
  steps.forEach(function (step,i) {
    t=step.t;
    res.push({t,op:"snap",stage:"play"});
    t+=PLAY_GAP;
    if (kind=="play" && i<steps.length-1)
      step.acts.forEach(act=>Act(act,"play"));
    assert(i==steps.length-1 || t<steps[i+1].t,name+": step "+i+" runs into the next.");
  });
  if (kind=="play")
    Quit(steps.at(-1).acts,"script");
  else
    Quit(["esc"],"esc");
  Quit(["shift+","esc","shift-"],"shift-esc");
  return res;
}

export function FrameRle(rle)
{//The 640x480 color indices of Start.HC's runs: a letter A-P, then a count over 1.
  const res=new Uint8Array(GR_W*GR_H),re=/([A-P])(\d*)/g;
  let i=0,m;
  while ((m=re.exec(rle)) && i<res.length) {
    const n=m[2]?+m[2]:1;
    res.fill(m[1].charCodeAt(0)-65,i,i+n);
    i+=n;
  }
  assert.equal(i,res.length,"A frame has "+res.length+" pixels, not "+i);
  return res;
}

export function FrameSnap(frame)
{//A frame's hash (FNV-1a over its color indices below FRAME_TOP), its count of
//colors and its cells: a 4-bit digest of each of 16x12 cells of 40x40, a hex
//digit a cell, so two machines' snaps say where on the screen they differ.
  const seen=new Set(),w=GR_W/THUMB_W,h=GR_H/THUMB_H,Fnv=(hash,c)=>Math.imul(hash^c,16777619)>>>0;
  let hash=0x811C9DC5,cells="";
  for (let i=FRAME_TOP*GR_W;i<frame.length;i++) {
    seen.add(frame[i]&15);
    hash=Fnv(hash,frame[i]&15);
  }
  for (let cy=0;cy<THUMB_H;cy++)
    for (let cx=0;cx<THUMB_W;cx++) {
      let d=0x811C9DC5;
      for (let y=Math.max(cy*h,FRAME_TOP);y<cy*h+h;y++)
        for (let x=cx*w;x<cx*w+w;x++)
          d=Fnv(d,frame[y*GR_W+x]&15);
      d^=d>>>16;
      d^=d>>>8;
      cells+=((d^d>>>4)&15).toString(16);
    }
  return {hash:hash.toString(16).padStart(8,"0"),colors:seen.size,cells};
}

const PALETTE=[0x000000,0x0000AA,0x00AA00,0x00AAAA,0xAA0000,0xAA00AA,0xAA5500,0xAAAAAA,
  0x555555,0x5555FF,0x55FF55,0x55FFFF,0xFF5555,0xFF55FF,0xFFFF55,0xFFFFFF];

function Crc(bytes)
{
  let c=~0;
  for (const b of bytes) {
    c^=b;
    for (let k=0;k<8;k++)
      c=c>>>1^0xEDB88320&-(c&1);
  }
  return ~c>>>0;
}

export function FramePng(frame)
{//The frame as a PNG in TempleOS's colors, to look at.
  const chunk=function (type,data) {
      const head=Buffer.alloc(8),body=Buffer.concat([Buffer.from(type),data]),tail=Buffer.alloc(4);
      head.writeUInt32BE(data.length);
      tail.writeUInt32BE(Crc(body));
      return Buffer.concat([head.subarray(0,4),body,tail]);
    },ihdr=Buffer.alloc(13),plte=Buffer.alloc(48),raw=Buffer.alloc((GR_W+1)*GR_H);
  ihdr.writeUInt32BE(GR_W,0);
  ihdr.writeUInt32BE(GR_H,4);
  ihdr[8]=8;
  ihdr[9]=3;
  PALETTE.forEach((rgb,i)=>plte.writeUIntBE(rgb,i*3,3));
  for (let y=0;y<GR_H;y++)
    for (let x=0;x<GR_W;x++)
      raw[y*(GR_W+1)+1+x]=frame[y*GR_W+x]&15;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",ihdr),
    chunk("PLTE",plte),chunk("IDAT",deflateSync(raw)),chunk("IEND",Buffer.alloc(0))]);
}

export async function SnapSave(dir,name,frame)
{//A snap's hash, colors and cells, with its PNG saved as dir/name.png.
  await mkdir(dir,{recursive:true});
  await writeFile(resolve(dir,name+".png"),FramePng(frame));
  return FrameSnap(frame);
}

export function CellsMoving(snaps)
{//The cells that changed from one snap to the next, a bit a cell, as hex.
  const bits=new Uint8Array(THUMB_W*THUMB_H/4);
  for (let k=1;k<snaps.length;k++)
    for (let i=0;i<THUMB_W*THUMB_H;i++)
      if (snaps[k].cells[i]!=snaps[k-1].cells[i])
        bits[i>>2]|=1<<(i&3);
  return [...bits].map(b=>b.toString(16)).join("");
}

export function PlayRecord(run,kind)
{//A run as the evidence keeps it. A snap is "hash:colors:cells"; a control
//keeps "hash:colors" and the cells that moved without input.
  const snaps=run.snaps || [],
    res={start:run.start,quit:run.quit,end:run.end,
      updates:snaps.length?snaps.at(-1).updates-snaps[0].updates:0,
      snaps:snaps.map(s=>s.hash+":"+s.colors+(kind=="control"?"":":"+s.cells))};
  if (kind=="control")
    res.moving=CellsMoving(snaps);
  if (run.detail) //Why a harness or machine failed.
    res.detail=run.detail.split("\n")[0].slice(0,200);
  return res;
}

export function PlayEnd(events,i)
{//The quit stage of a run that was over when it reached event i.
  return i>=events.length?"ignored":events[i].stage=="play"?"early":events[i].stage;
}
