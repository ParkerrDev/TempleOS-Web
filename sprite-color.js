// Unboosted source colors with restrained, fixed-pattern palette mixtures.
// Zero strength gives solid colors; animation frames share a bounded cache.
// Oklab transform: https://bottosson.github.io/posts/oklab/ (public domain).
import {SPRITE_NOISE,SPRITE_NOISE_SIDE} from './sprite-noise.js';
export const PALETTE = Object.freeze([
  [0,0,0],[0,0,170],[0,170,0],[0,170,170],[170,0,0],[170,0,170],[170,85,0],[170,170,170],
  [85,85,85],[85,85,255],[85,255,85],[85,255,255],[255,85,85],[255,85,255],[255,255,85],[255,255,255],
].map(Object.freeze));
const linear = v => {v/=255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;};
const LINEAR = PALETTE.map(c=>c.map(linear));
const SRGB = Float64Array.from({length:256},(_,i)=>linear(i));
function lab(r,g,b) {
  const l=Math.cbrt(0.4122214708*r+0.5363325363*g+0.0514459929*b);
  const m=Math.cbrt(0.2119034982*r+0.6806995451*g+0.1073969566*b);
  const s=Math.cbrt(0.0883024619*r+0.2817188376*g+0.6299787005*b);
  return [0.2104542553*l+0.793617785*m-0.0040720468*s,
    1.9779984951*l-2.428592205*m+0.4505937099*s,
    0.0259040371*l+0.7827717662*m-0.808675766*s];
}
const LAB=LINEAR.map(c=>lab(...c));
const distance=(a,b,chromaWeight=4)=>(a[0]-b[0])**2+chromaWeight*((a[1]-b[1])**2+(a[2]-b[2])**2);
const EXACT=new Map(PALETTE.map((c,i)=>[(c[0]<<16)|(c[1]<<8)|c[2],i]));
let NOISE_WEIGHTS;
// A local outlier check and edge-preserving smoothing remove compression flecks before
// they become saturated palette pixels. Exact palette art stays untouched.
function soften(rgba,width,height,alpha) {
  NOISE_WEIGHTS??=Float32Array.from({length:3*255*255+1},(_,d)=>Math.exp(-d/(2*25*25)));
  const out=new Uint8ClampedArray(rgba),neighbors=[];
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    const i=(y*width+x)*4,r=rgba[i],g=rgba[i+1],b=rgba[i+2];
    if(rgba[i+3]<alpha||EXACT.has((r<<16)|(g<<8)|b))continue;
    neighbors.length=0;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++) {
      if(x+dx<0||x+dx>=width||y+dy<0||y+dy>=height)continue;
      const j=((y+dy)*width+x+dx)*4;
      if(rgba[j+3]>=alpha)neighbors.push(j);
    }
    if(neighbors.length>=6) {
      const median=[0,1,2].map(k=>neighbors.map(j=>rgba[j+k]).sort((a,b)=>a-b)[neighbors.length>>1]);
      const near=neighbors.filter(j=>median.every((v,k)=>Math.abs(rgba[j+k]-v)<=30)).length;
      if(near>=5&&median.some((v,k)=>Math.abs(rgba[i+k]-v)>45)) {
        out.set(median,i);continue;
      }
    }
    let red=2*r,green=2*g,blue=2*b,total=2;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++) {
      if(!dx&&!dy||x+dx<0||x+dx>=width||y+dy<0||y+dy>=height)continue;
      const j=((y+dy)*width+x+dx)*4;
      if(rgba[j+3]<alpha)continue;
      const weight=NOISE_WEIGHTS[(r-rgba[j])**2+(g-rgba[j+1])**2+(b-rgba[j+2])**2];
      red+=rgba[j]*weight;green+=rgba[j+1]*weight;blue+=rgba[j+2]*weight;total+=weight;
    }
    out[i]=red/total;out[i+1]=green/total;out[i+2]=blue/total;
  }
  return out;
}
// Fit the unmodified source color with up to three nearby-hue palette entries.
// Work in display RGB so the mixture does not over-brighten dark photographs.
const DISPLAY=PALETTE.map(c=>c.map(v=>v/255));
const squareDistance=(a,b)=>a.reduce((sum,v,k)=>sum+(v-b[k])**2,0);
const chroma=c=>{const mean=(c[0]+c[1]+c[2])/3;return c.map(v=>v-mean);};
const CHROMA=DISPLAY.map(chroma),SATURATION=CHROMA.map(c=>Math.hypot(...c));
const LUMA=DISPLAY.map(c=>0.2126*c[0]+0.7152*c[1]+0.0722*c[2]);
const NEUTRAL=new Set([0,7,8,15]);
// One 128 KB table per active strength, shared across the entire clip.
let MIXES,lastStrength;
function mixtureFor(r,g,b,strength) {
  MIXES??=new Uint32Array(32768);
  if(lastStrength!==strength){MIXES.fill(0);lastStrength=strength;}
  const key=((r>>3)<<10)|((g>>3)<<5)|(b>>3);
  if(MIXES[key])return MIXES[key]-1;
  const rgb=[(r&248)+4,(g&248)+4,(b&248)+4].map(v=>v/255);
  const tint=chroma(rgb),magnitude=Math.hypot(...tint);
  const alignment=CHROMA.map((c,j)=>magnitude>1e-9&&SATURATION[j]?c.reduce((sum,v,k)=>sum+v*tint[k],0)/(magnitude*SATURATION[j]):0);
  const hueLimit=Math.max(0.7,Math.max(...alignment)-0.08);
  const value=Math.max(...rgb),saturation=(value-Math.min(...rgb))/value;
  const allowed=CHROMA.map((_,c)=>NEUTRAL.has(c)||magnitude>0.015&&alignment[c]>=hueLimit&&
    (c<9||c===12||saturation>=0.35)&&(c!==10||g>=230));
  const penalty=(1-strength/100)**4;
  let score=Infinity,packed=0;
  const choose=(cost,a,b,c,na,nb)=>{
    if(cost<score-1e-10){score=cost;packed=a|(b<<4)|(c<<8)|(na<<12)|(nb<<21);}
  };
  for(let a=0;a<16;a++)if(allowed[a]) {
    choose(squareDistance(rgb,DISPLAY[a]),a,0,0,256,0);
    if(!strength)continue;
    for(let b=a+1;b<16;b++)if(allowed[b]&&Math.abs(LUMA[a]-LUMA[b])<0.6) {
      const p=DISPLAY[a],u=DISPLAY[b].map((v,k)=>v-p[k]);
      const uu=u.reduce((sum,v)=>sum+v*v,0),ru=u.reduce((sum,v,k)=>sum+(rgb[k]-p[k])*v,0);
      const nb=Math.round(Math.max(0,Math.min(1,ru/uu))*256),wb=nb/256;
      if(nb>0&&nb<256) {
        const mean=p.map((v,k)=>v+wb*u[k]);
        choose(squareDistance(rgb,mean)+penalty*wb*(1-wb)*uu,a,b,0,256-nb,nb);
      }
      for(let c=b+1;c<16;c++)if(allowed[c]&&Math.max(LUMA[a],LUMA[b],LUMA[c])-Math.min(LUMA[a],LUMA[b],LUMA[c])<0.6) {
        const v=DISPLAY[c].map((v,k)=>v-p[k]);
        const vv=v.reduce((sum,v)=>sum+v*v,0),uv=u.reduce((sum,q,k)=>sum+q*v[k],0),det=uu*vv-uv*uv;
        if(det<1e-9)continue;
        const rv=v.reduce((sum,v,k)=>sum+(rgb[k]-p[k])*v,0);
        const tb=(ru*vv-rv*uv)/det,tc=(rv*uu-ru*uv)/det;
        if(tb<=0||tc<=0||tb+tc>=1)continue;
        const nb=Math.round(tb*256),nc=Math.round(tc*256),na=256-nb-nc;
        if(na<=0||nb<=0||nc<=0)continue;
        const wa=na/256,wb=nb/256,wc=nc/256,mean=p.map((q,k)=>q+wb*u[k]+wc*v[k]);
        const variance=wa*wb*uu+wa*wc*vv+wb*wc*squareDistance(DISPLAY[b],DISPLAY[c]);
        choose(squareDistance(rgb,mean)+penalty*variance,a,b,c,na,nb);
      }
    }
  }
  MIXES[key]=packed+1;return packed;
}
export function mapPalette(rgba,width,height,mode,alpha,{strength=35}={}) {
  const out=new Uint8Array(width*height);
  if(mode==='stable') {
    if(!Number.isFinite(strength)||strength<0||strength>100)throw new Error('Dither strength must be between 0 and 100.');
    const source=soften(rgba,width,height,alpha);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
      const n=y*width+x,i=n*4;
      if(source[i+3]<alpha){out[n]=255;continue;}
      const exact=EXACT.get((rgba[i]<<16)|(rgba[i+1]<<8)|rgba[i+2]);
      if(exact!==undefined){out[n]=exact;continue;}
      const mix=mixtureFor(source[i],source[i+1],source[i+2],strength);
      const threshold=SPRITE_NOISE[(y%SPRITE_NOISE_SIDE)*SPRITE_NOISE_SIDE+x%SPRITE_NOISE_SIDE];
      const na=(mix>>>12)&511,nb=(mix>>>21)&511;
      out[n]=threshold<na?mix&15:threshold<na+nb?(mix>>>4)&15:(mix>>>8)&15;
    }
    return out;
  }
  // Serpentine diffusion carries unclipped linear-light error into the next
  // pixels. Clamping it at each step loses warm color in saturated regions.
  let row=new Float64Array((width+2)*3),next=new Float64Array(row.length);
  for(let y=0;y<height;y++) {
    const step=y&1?-1:1;
    for(let x=step===1?0:width-1;x>=0&&x<width;x+=step) {
      const n=y*width+x,i=n*4,j=(x+1)*3;
      if(rgba[i+3]<alpha){out[n]=255;continue;}
      const rgb=[SRGB[rgba[i]]+row[j],SRGB[rgba[i+1]]+row[j+1],SRGB[rgba[i+2]]+row[j+2]],target=lab(...rgb);
      let best=0,score=Infinity;
      for(let c=0;c<16;c++){const d=distance(target,LAB[c],2);if(d<score){best=c;score=d;}}
      out[n]=best;
      for(let k=0;k<3;k++) {
        const error=rgb[k]-LINEAR[best][k];
        row[j+step*3+k]+=error*7/16;
        next[j-step*3+k]+=error*3/16;next[j+k]+=error*5/16;next[j+step*3+k]+=error/16;
      }
    }
    [row,next]=[next,row];next.fill(0);
  }
  return out;
}
