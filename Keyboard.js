export const KEY={
  Escape:0x01,Digit1:0x02,Digit2:0x03,Digit3:0x04,Digit4:0x05,
  Digit5:0x06,Digit6:0x07,Digit7:0x08,Digit8:0x09,Digit9:0x0A,
  Digit0:0x0B,Minus:0x0C,Equal:0x0D,Backspace:0x0E,Tab:0x0F,
  KeyQ:0x10,KeyW:0x11,KeyE:0x12,KeyR:0x13,KeyT:0x14,KeyY:0x15,
  KeyU:0x16,KeyI:0x17,KeyO:0x18,KeyP:0x19,BracketLeft:0x1A,
  BracketRight:0x1B,Enter:0x1C,ControlLeft:0x1D,KeyA:0x1E,
  KeyS:0x1F,KeyD:0x20,KeyF:0x21,KeyG:0x22,KeyH:0x23,KeyJ:0x24,
  KeyK:0x25,KeyL:0x26,Semicolon:0x27,Quote:0x28,Backquote:0x29,
  ShiftLeft:0x2A,Backslash:0x2B,KeyZ:0x2C,KeyX:0x2D,KeyC:0x2E,
  KeyV:0x2F,KeyB:0x30,KeyN:0x31,KeyM:0x32,Comma:0x33,
  Period:0x34,Slash:0x35,ShiftRight:0x36,NumpadMultiply:0x37,
  AltLeft:0x38,Space:0x39,CapsLock:0x3A,F1:0x3B,F2:0x3C,F3:0x3D,
  F4:0x3E,F5:0x3F,F6:0x40,F7:0x41,F8:0x42,F9:0x43,F10:0x44,
  NumLock:0x45,ScrollLock:0x46,Numpad7:0x47,Numpad8:0x48,
  Numpad9:0x49,NumpadSubtract:0x4A,Numpad4:0x4B,Numpad5:0x4C,
  Numpad6:0x4D,NumpadAdd:0x4E,Numpad1:0x4F,Numpad2:0x50,
  Numpad3:0x51,Numpad0:0x52,NumpadDecimal:0x53,
  IntlBackslash:0x56,F11:0x57,F12:0x58,
  //Bit 8 records the set-1 E0 prefix; keypad keys keep their own identity.
  NumpadEnter:0x11C,ControlRight:0x11D,NumpadDivide:0x135,
  PrintScreen:0x137,AltRight:0x138,Home:0x147,ArrowUp:0x148,
  PageUp:0x149,ArrowLeft:0x14B,ArrowRight:0x14D,End:0x14F,
  ArrowDown:0x150,PageDown:0x151,Insert:0x152,Delete:0x153,
  MetaLeft:0x15B,MetaRight:0x15C,ContextMenu:0x15D,Pause:0x200,
};

export function KeyBytes(key,down)
{
  if (key==KEY.Pause)
    return down?[0xE1,0x1D,0x45,0xE1,0x9D,0xC5]:[];
  if (key==KEY.PrintScreen)
    return down?[0xE0,0x2A,0xE0,0x37]:[0xE0,0xB7,0xE0,0xAA];
  let res=[key&127|(down?0:128)];
  if (key&256)
    res.unshift(0xE0);
  return res;
}

const chars=new Map();
for (let ch of "abcdefghijklmnopqrstuvwxyz") {
  chars.set(ch,[KEY["Key"+ch.toUpperCase()],false]);
  chars.set(ch.toUpperCase(),[KEY["Key"+ch.toUpperCase()],true]);
}
for (let [code,pair] of Object.entries({
  Digit0:"0)",Digit1:"1!",Digit2:"2@",Digit3:"3#",Digit4:"4$",
  Digit5:"5%",Digit6:"6^",Digit7:"7&",Digit8:"8*",Digit9:"9(",
  Minus:"-_",Equal:"=+",BracketLeft:"[{",BracketRight:"]}",
  Semicolon:";:",Quote:"'\"",Backquote:"`~",Backslash:"\\|",
  Comma:",<",Period:".>",Slash:"/?",Space:" ",Tab:"\t",Enter:"\n",
})) {
  chars.set(pair[0],[KEY[code],false]);
  if (pair.length==2)
    chars.set(pair[1],[KEY[code],true]);
}

export function KeyInput(send)
{
  let sources=new Map();
  function held()
  {
    return [...new Set(sources.values())];
  }
  function down(source,key)
  {
    if (key===undefined || sources.has(source))
      return false;
    let pressed=held().includes(key);
    if (key!=KEY.Pause)
      sources.set(source,key);
    if (!pressed)
      send(KeyBytes(key,true));
    return true;
  }
  function up(source)
  {
    let key=sources.get(source);
    if (!sources.delete(source))
      return false;
    if (!held().includes(key))
      send(KeyBytes(key,false));
    return true;
  }
  function tap(key)
  {
    let source=Symbol();
    down(source,key);
    up(source);
  }
  function chord(key,modifier)
  {
    let source=Symbol();
    down(source,modifier);
    tap(key);
    up(source);
  }
  function text(ch)
  {
    let entry=chars.get(ch);
    if (!entry)
      return false;
    if (entry[1])
      chord(entry[0],KEY.ShiftLeft);
    else
      tap(entry[0]);
    return true;
  }
  function reset()
  {
    let keys=held();
    sources.clear();
    for (let key of keys)
      send(KeyBytes(key,false));
  }
  return {down,up,tap,chord,text,held,reset};
}

export function KeyBar(bar,input)
{
  let latched=new Set(),pointers=new Map(),buttons=[...bar.children],
    names={Esc:"Escape",Ctrl:"ControlLeft",Alt:"AltLeft",Shift:"ShiftLeft",
      Win:"MetaLeft",Ins:"Insert",Del:"Delete",PgUp:"PageUp",PgDn:"PageDown"},
    modifiers=new Set(["Ctrl","Alt","Shift","Win"]);
  function unlatch()
  {
    for (let button of latched) {
      input.up(button);
      button.classList.remove("on");
      button.setAttribute("aria-pressed","false");
    }
    latched.clear();
  }
  function toggle(button,key)
  {
    if (latched.has(button)) {
      input.up(button);
      latched.delete(button);
    } else {
      input.down(button,key);
      latched.add(button);
    }
    button.classList.toggle("on",latched.has(button));
    button.setAttribute("aria-pressed",String(latched.has(button)));
  }
  function finish(e)
  {
    let press=pointers.get(e.pointerId);
    if (!press)
      return;
    pointers.delete(e.pointerId);
    input.up(press);
    press.button.classList.remove("on");
    unlatch();
  }
  for (let button of buttons) {
    let name=button.textContent,key=KEY[names[name] || name],
      modifier=modifiers.has(name);
    if (modifier)
      button.setAttribute("aria-pressed","false");
    button.addEventListener("pointerdown",function (e) {
      if (e.button!=0)
        return;
      e.preventDefault();
      button.setPointerCapture(e.pointerId);
      let press={button};
      pointers.set(e.pointerId,press);
      if (modifier)
        toggle(button,key);
      else {
        input.down(press,key);
        button.classList.add("on");
      }
    });
    button.addEventListener("pointerup",function (e) {
      if (modifier) {
        pointers.delete(e.pointerId);
        return;
      }
      finish(e);
    });
    button.addEventListener("pointercancel",finish);
    button.addEventListener("lostpointercapture",finish);
    button.addEventListener("click",function (e) {
      if (e.detail)
        return;
      if (modifier)
        toggle(button,key);
      else {
        input.tap(key);
        unlatch();
      }
    });
  }
  return function () {
    for (let press of pointers.values()) {
      input.up(press);
      press.button.classList.remove("on");
    }
    pointers.clear();
    unlatch();
  };
}
