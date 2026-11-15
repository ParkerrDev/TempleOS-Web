// Fullscreen belongs to the view, so replacing a game's canvas keeps it open.
export function setupGameViews({release:releaseMouse,raise}){
  const controls=[['gameFullscreen','gameWin','Fullscreen'],['editorFullscreen','editorWin','Fullscreen editor'],['previewFullscreen','editorPreview','Fullscreen game']]
    .map(([button,target,label])=>({button:document.getElementById(button),target:document.getElementById(target),label}));
  let active=null,real=false,revision=0,overflow='';
  const activeDocument=()=>active?.ownerDocument||document;
  const fullscreenElement=()=>activeDocument().fullscreenElement||activeDocument().webkitFullscreenElement;
  const release=()=>releaseMouse();
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
    active.classList.remove('view-fullscreen');
    activeDocument().body.style.overflow=overflow;active=null;real=false;update();release();
    dispatchEvent(new Event('input-view-change'));
  }
  function exit(){
    ++revision;
    const doc=activeDocument(),element=fullscreenElement(),wasOurs=active&&(element===active||active.contains(element));
    clear();
    if(wasOurs){
      try{(doc.exitFullscreen||doc.webkitExitFullscreen).call(doc)?.catch?.(()=>{});}catch{}
    }
  }
  function toggle(target){
    if(active===target){exit();return;}
    release();
    if(active)exit();
    const request=++revision,doc=target.ownerDocument;active=target;overflow=activeDocument().body.style.overflow;
    activeDocument().body.style.overflow='hidden';active.classList.add('view-fullscreen');
    raise(target.closest('.overlay'));update();focus();
    dispatchEvent(new Event('input-view-change'));
    const enter=target.requestFullscreen||target.webkitRequestFullscreen;
    if(enter){
      try{Promise.resolve(enter.call(target)).then(()=>{
        if(request!==revision&&active!==target&&fullscreenElement()===target){
          (doc.exitFullscreen||doc.webkitExitFullscreen).call(doc)?.catch?.(()=>{});
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
  function ViewDocument(doc){
    doc.addEventListener('fullscreenchange',changed);
    doc.addEventListener('webkitfullscreenchange',changed);
    doc.addEventListener('keydown',event=>{
      if(active&&event.key==='Escape'){
        event.preventDefault();event.stopImmediatePropagation();exit();
      }
    },true);
  }
  ViewDocument(document);
  addEventListener('winpopup',event=>ViewDocument(event.detail.window.document));
  return {
    isWithin:container=>!!active&&(container===active||container.contains(active)),
    exitWithin(container){if(this.isWithin(container))exit();},
  };
}
