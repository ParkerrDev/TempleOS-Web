import {KEY} from './Keyboard.js';
import {TouchControls} from './TouchControls.js';

export function MobileInput({frame,target})
{
  const controls=document.getElementById('touchui'),
    input=document.getElementById('mobInput'),
    keys=document.getElementById('keysbar').closest('.keyswin'),
    home=document.createComment('Keys window'),
    canvas=frame.querySelector('canvas');
  keys.before(home);
  controls.append(input);
  let current=target(),host=frame,textTarget=null;
  const reset=TouchControls(frame,{
    position:()=>current.mouse.position(),
    move:(x,y)=>current.mouse.move(x,y),
    buttons:mask=>current.mouse.buttons(mask),
  });
  function layout()
  {
    const viewport=window.visualViewport;
    const bottom=viewport?viewport.offsetTop+viewport.height:innerHeight;
    const inset=element=>Math.min(Math.max(0,element.clientHeight-140),
      Math.max(0,element.getBoundingClientRect().bottom-bottom));
    controls.style.setProperty('--kbinset',inset(host)+'px');
    keys.style.setProperty('--keyboard-inset',keys.classList.contains('input-docked')?
      inset(keys.parentElement)+'px':'0px');
  }
  function sync()
  {
    const next=target();
    if(next.canvas!==current.canvas) {
      reset();current=next;textTarget=null;
    }
    const fullscreen=document.fullscreenElement||document.webkitFullscreenElement||
      current.canvas.closest('.fsmode,.view-fullscreen');
    const dock=document.body.classList.contains('touch')&&fullscreen?.contains(current.canvas)?fullscreen:null;
    const parent=current.canvas.parentElement;
    if(host!==parent) {
      reset();host.classList.remove('touch-host');host=parent;
      host.classList.add('touch-host');host.append(controls);
    }
    const dest=dock||home.parentElement;
    if(keys.parentElement!==dest) {
      if(dock)dest.append(keys);
      else home.after(keys);
    }
    keys.classList.toggle('input-docked',!!dock);
    controls.classList.toggle('input-docked',!!dock);
    layout();
  }
  document.getElementById('tKb').addEventListener('click',()=>{
    sync();textTarget=current.keys();input.focus({preventScroll:true});
  });
  input.addEventListener('beforeinput',event=>{
    if(event.isComposing)return;
    if(event.inputType==='insertText'&&event.data)
      for(const ch of event.data)textTarget?.text(ch);
    else if(event.inputType==='deleteContentBackward')textTarget?.tap(KEY.Backspace);
    else if(event.inputType==='insertLineBreak')textTarget?.tap(KEY.Enter);
    event.preventDefault();
  });
  input.addEventListener('compositionend',event=>{
    for(const ch of event.data)textTarget?.text(ch);
    input.value='';
  });
  input.addEventListener('keydown',event=>{
    if(!event.isComposing&&['Enter','Backspace'].includes(event.key)) {
      textTarget?.tap(KEY[event.key]);event.preventDefault();
    }
  });
  for(const name of ['game-mouse-change','input-view-change'])addEventListener(name,sync);
  for(const name of ['fullscreenchange','webkitfullscreenchange'])document.addEventListener(name,sync);
  addEventListener('preview-input-reset',()=>{reset();textTarget=null;});
  document.addEventListener('pointerdown',event=>{
    if(event.target===canvas||event.target===target().canvas)sync();
  },true);
  window.visualViewport?.addEventListener('resize',layout);
  window.visualViewport?.addEventListener('scroll',layout);
  addEventListener('resize',layout);
  new ResizeObserver(layout).observe(controls);
  sync();
}
