import assert from 'node:assert/strict';
import {setupGameViews} from '../game-view.js';

const document=new EventTarget(),nodes=new Map();let releases=0;
class Node extends EventTarget{
  constructor(id){super();this.id=id;this.attributes={};this.lastElementChild={textContent:''};this.classes=new Set();this.classList={add:v=>this.classes.add(v),remove:v=>this.classes.delete(v),contains:v=>this.classes.has(v)};}
  setAttribute(k,v){this.attributes[k]=v;}
  querySelector(){return {focus(){}};}
  closest(){return this;}
  contains(node){return this===node||this.id==='editorWin'&&node?.id==='editorPreview';}
  requestFullscreen(){document.fullscreenElement=this;document.dispatchEvent(new Event('fullscreenchange'));return Promise.resolve();}
}
document.getElementById=id=>{if(!nodes.has(id))nodes.set(id,new Node(id));return nodes.get(id);};
document.body={style:{overflow:'auto'}};
document.exitFullscreen=()=>{document.fullscreenElement=null;document.dispatchEvent(new Event('fullscreenchange'));return Promise.resolve();};
globalThis.document=document;globalThis.window={__holycEditor:{releaseMouse(){releases++;}},__winChrome:{raise(){}}};
const views=setupGameViews(),node=id=>document.getElementById(id),click=id=>node(id).dispatchEvent(new Event('click'));
for(const [button,target] of [['gameFullscreen','gameWin'],['editorFullscreen','editorWin'],['previewFullscreen','editorPreview']]){
  click(button);assert.equal(document.fullscreenElement,node(target));
  assert(node(target).classList.contains('view-fullscreen'));assert(views.isWithin(node(target)));
  assert.equal(node(button).lastElementChild.textContent,'Exit fullscreen');
  document.exitFullscreen();
  assert(!node(target).classList.contains('view-fullscreen'));assert.equal(document.body.style.overflow,'auto');
}
node('editorPreview').requestFullscreen=()=>Promise.reject(new Error('Unavailable'));
click('previewFullscreen');await Promise.resolve();await Promise.resolve();
assert(views.isWithin(node('editorWin')),'viewport fallback belongs to its editor');
const event=new Event('keydown',{cancelable:true});event.key='Escape';document.dispatchEvent(event);
assert(event.defaultPrevented);assert(!views.isWithin(node('editorWin')));assert.equal(document.body.style.overflow,'auto');
click('editorFullscreen');views.exitWithin(node('gameWin'));
assert(views.isWithin(node('editorWin')),'closing another view must not exit the editor');
views.exitWithin(node('editorWin'));assert.equal(document.fullscreenElement,null);
let complete;
node('gameWin').requestFullscreen=()=>new Promise(resolve=>{complete=()=>{document.fullscreenElement=node('gameWin');document.dispatchEvent(new Event('fullscreenchange'));resolve();};});
click('gameFullscreen');click('gameFullscreen');complete();await Promise.resolve();
assert.equal(document.fullscreenElement,null,'a late fullscreen request cannot reopen a closed view');
assert(releases>0);
console.log('Game views: game/editor/preview fullscreen, browser Escape, fallback, focus cleanup and cancelled requests passed.');
