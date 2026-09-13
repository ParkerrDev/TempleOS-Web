import assert from 'node:assert/strict';
import {createSpritePlayer} from '../sprite-player.js';
let callback=null,inBackground=false,drawn=[];
const player=createSpritePlayer({count:75,delayMs:40,draw:i=>drawn.push(i),
 requestFrame:cb=>{callback=cb;return 1;},cancelFrame:()=>{callback=null;},hidden:()=>inBackground});
player.play();callback(0);
for(let time=20;time<=1000;time+=20)callback(time);
assert.equal(drawn.length,26);assert.equal(drawn.at(-1),25,'25 frames per second');
callback(1480);assert.equal(drawn.at(-1),37,'Late callbacks catch up to elapsed time');
callback(3000);assert.equal(drawn.at(-1),0,'Loop duration stays exactly three seconds');
inBackground=true;callback(4000);inBackground=false;callback(8000);assert.equal(drawn.at(-1),0,'Hidden time is paused');
callback(8040);assert.equal(drawn.at(-1),1);
player.stop();assert.equal(callback,null);assert.equal(player.playing,false);
player.play(40);callback(10000);callback(10040);assert.equal(drawn.at(-1),41,'Resume starts from selected frame');
player.stop();
console.log('Sprite playback: 25 fps, late-frame recovery, exact loop duration, hidden pause, stop and seek passed.');
