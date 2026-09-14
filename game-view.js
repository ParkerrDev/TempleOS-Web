// Fullscreen belongs to the view, so replacing a game's canvas keeps it open.
export function setupGameViews(){
  const controls=[['gameFullscreen','gameWin','Fullscreen'],['editorFullscreen','editorWin','Fullscreen editor'],['previewFullscreen','editorPreview','Fullscreen game']]
    .map(([button,target,label])=>({button:document.getElementById(button),target:document.getElementById(target),label}));
  let active=null,real=false,revision=0,overflow='';
  const fullscreenElement=()=>document.fullscreenElement||document.webkitFullscreenElement;
  const release=()=>window.__holycEditor?.releaseMouse();
  const focus=()=>active?.querySelector('#screen')?.focus({preventScroll:true});
  function update(){
    for(const {button,target,label} of controls){
      const selected=target===active;
      button.setAttribute('aria-pressed',String(selected));
      button.lastElementChild.textContent=selected?'Exit fullscreen':label;
    }
  }
  function clear(){
    if(!active)return;
    active.classList.remove('view-fullscreen');active=null;real=false;
    document.body.style.overflow=overflow;update();release();
  }
  function exit(){
    ++revision;
    const element=fullscreenElement(),wasOurs=active&&(element===active||active.contains(element));
    clear();
    if(wasOurs){
      try{(document.exitFullscreen||document.webkitExitFullscreen).call(document)?.catch?.(()=>{});}catch{}
    }
  }
  function toggle(target){
    if(active===target){exit();return;}
    release();
    if(active)exit();
    const request=++revision;active=target;overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';active.classList.add('view-fullscreen');
    window.__winChrome?.raise(target.closest('.overlay'));update();focus();
    const enter=target.requestFullscreen||target.webkitRequestFullscreen;
    if(enter){
      try{Promise.resolve(enter.call(target)).then(()=>{
        if(request!==revision&&active!==target&&fullscreenElement()===target){
          (document.exitFullscreen||document.webkitExitFullscreen).call(document)?.catch?.(()=>{});
        }
      }).catch(()=>{});}catch{}
    }
    // The viewport layout also works when element fullscreen is unavailable.
  }
  function changed(){
    if(!active)return;
    if(fullscreenElement()===active){real=true;focus();}
    else if(real){++revision;clear();}
  }
  for(const {button,target} of controls)button.addEventListener('click',()=>toggle(target));
  document.addEventListener('fullscreenchange',changed);
  document.addEventListener('webkitfullscreenchange',changed);
  document.addEventListener('keydown',event=>{
    if(active&&event.key==='Escape'){
      event.preventDefault();event.stopImmediatePropagation();exit();
    }
  },true);
  return {
    isWithin:container=>!!active&&(container===active||container.contains(active)),
    exitWithin(container){if(this.isWithin(container))exit();},
  };
}
