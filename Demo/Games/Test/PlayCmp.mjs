//Where a game's play runs (Play.mjs) show it playing, and where the three
//machines agree. The evidence's verdicts are made here and checked by
//Play.test.mjs, so changing this file needs no new runs.

const hashOf=s=>s.split(":")[0],cellsOf=s=>s.split(":")[2] || "";

function Mask(...hex)
{//The cells marked in any of the controls' moving masks, as a set of indices.
  const res=new Set();
  for (const h of hex)
    for (let i=0;i<(h || "").length;i++)
      for (let b=0;b<4;b++)
        if (parseInt(h[i],16)>>b&1)
          res.add(i*4+b);
  return res;
}

function Cells(a,b,mask)
{//How many cells of two snaps differ outside mask, the cells that move by themselves.
  const ca=cellsOf(a),cb=cellsOf(b);
  let res=0;
  for (let i=0;i<ca.length;i++)
    res+=!mask.has(i) && ca[i]!=cb[i];
  return res;
}

export function PlayVerdict(play,control)
{//What one machine's play run shows beside its run without input. Snap 0 is
//at the start, snap k+1 just before step k; input step k is followed by snap k+2.
  const s=play.snaps || [],p=s.map(hashOf),c=(control?.snaps || []).map(hashOf),
    mask=Mask(control?.moving),moved=[],input=[];
  for (let k=0;k+2<p.length;k++) {
    moved[k]=p[k+2]!=p[k+1];
    //The input changed cells that do not move without it, or both runs
    //matched until the input and the input made them part.
    input[k]=moved[k] && (Cells(s[k+1],s[k+2],mask)>0 ||
      p[1]==c[1] && p[k+1]==c[k+1] && p[k+2]!=c[k+2]);
  }
  const res={alive:play.start=="running" && play.quit!="early" && play.quit!="-",
    drawn:p.length>0 && s.every(x=>+x.split(":")[1]>=2),advancing:play.updates>0,
    frames:new Set(p).size,
    clean:![play.start,play.end,control?.start,control?.end].some(x=>String(x).startsWith("except")),
    response:input.some(Boolean)?"input":moved.some(Boolean)?"moved":"none"};
  res.plays=res.clean && res.alive && res.drawn && res.advancing && res.response!="none";
  //A program (Apps/Programs.js) need not take input: it runs when it returns
  //cleanly before the script, or stays alive, draws and advances until the
  //script ends it.
  res.runs=res.clean && (play.start=="returned" || res.alive && res.drawn && res.advancing);
  return res;
}

function Agree(a,b,mask)
{//Two runs' snaps side by side: how many cells differ in each outside mask.
  if (!a || !b || a.snaps.length!=b.snaps.length || !a.snaps.length)
    return null;
  return a.snaps.map((s,i)=>Cells(s,b.snaps[i],mask));
}

export function PlayCompare(g)
{//Where the machines agree on one game, and which runners its play check
//enables. Cells that change without input on either machine (the window
//manager's blinking title and cursor, a game's own motion) are left out, so
//"same" is exact frame equality everywhere else; "exact" is the whole frame.
  const real=g.real && PlayVerdict(g.real.play,g.real.control),
    site=g.site && PlayVerdict(g.site.play,g.site.control),
    browser=g.browser?.play && PlayVerdict(g.browser.play,g.browser.control),
    kvm=g.kvm?.play && PlayVerdict(g.kvm.play,g.kvm.control),
    quit=(a,b)=>!!(a && b && a.quit==b.quit && a.end==b.end),
    final=r=>r.start=="running"?r.end:r.start,
    //A program's two runs end the same way: how, and at which stage when
    //both were running. The God Tools' Word in the browser asks no timer
    //pop-up, so it returns where V5.03 waits for OKAY.
    ended=(a,b)=>!!(a && b && final(a)==final(b) &&
      (a.start!="running" || b.start!="running" || a.quit==b.quit)),
    agree=(x,y,v)=>g.program?v.runs && ended(x.play,y.play) && ended(x.control,y.control):
      v.plays && quit(x.play,y.play) && quit(x.control,y.control),
    exact=(a,b)=>!!(a && b && a.snaps.length && a.snaps.length==b.snaps.length &&
      a.snaps.every((s,i)=>hashOf(s)==hashOf(b.snaps[i]))),
    res={real,site,browser};
  if (real) {
    const again=Agree(g.real.play,g.real.again,Mask(g.real.control.moving));
    res.deterministic=!!again && again.every(n=>!n);
  }
  if (real && site) {
    res.siteCells=Agree(g.real.play,g.site.play,Mask(g.real.control.moving,g.site.control.moving));
    res.siteSame=!!res.siteCells && res.siteCells.every(n=>!n);
    res.siteExact=exact(g.real.play,g.site.play);
    res.siteQuit=quit(g.real.play,g.site.play) && quit(g.real.control,g.site.control);
    res.templeos=(g.program?real.runs:real.plays) && agree(g.real,g.site,site);
  }
  if (real && browser) {
    res.browserCells=Agree(g.real.play,g.browser.play,
      Mask(g.real.control.moving,g.browser.control?.moving));
    res.browserSame=!!res.browserCells && res.browserCells.every(n=>!n);
    res.browserExact=exact(g.real.play,g.browser.play);
    res.browserQuit=quit(g.real.play,g.browser.play) && quit(g.real.control,g.browser.control);
  }
  res.browserPlays=!!(g.program?real?.runs && browser && agree(g.real,g.browser,browser):
    real?.plays && browser?.plays && res.browserQuit);
  if (real && kvm) {
    res.kvm=kvm;
    res.kvmCells=Agree(g.real.play,g.kvm.play,Mask(g.real.control.moving,g.kvm.control.moving));
    res.kvmSame=!!res.kvmCells && res.kvmCells.every(n=>!n);
    res.kvmExact=exact(g.real.play,g.kvm.play);
    res.kvmQuit=quit(g.real.play,g.kvm.play) && quit(g.real.control,g.kvm.control);
    res.kvmMatch=g.program?kvm.runs==real.runs && ended(g.real.play,g.kvm.play) &&
      ended(g.real.control,g.kvm.control):res.kvmQuit && kvm.plays==real.plays;
  }
  return res;
}
