import {KEY,KeyInput} from "../hemu/holyc-wasm/src/runtime/keyboard.js";
export {KEY,KeyBytes,KeyInput} from "../hemu/holyc-wasm/src/runtime/keyboard.js";

export function KeyRoute(target)
{
  const owners=new Map();
  function down(source,key)
  {
    if (owners.has(source)) return false;
    const input=target();
    if (!input) return false;
    owners.set(source,input);
    if (input.down(source,key)) return owners.has(source);
    owners.delete(source);
    return false;
  }
  function up(source)
  {
    const input=owners.get(source);
    owners.delete(source);
    return input?.up(source) || false;
  }
  function tap(key)
  {
    const source=Symbol();
    down(source,key);
    up(source);
  }
  return {down,up,tap};
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
      if (input.down(button,key)) latched.add(button);
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
    let name=button.textContent,key=KEY[button.dataset.key || names[name] || name],
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
        if (input.down(press,key)) button.classList.add("on");
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
