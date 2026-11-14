import {HolyCStr} from "../../Kernel/GuestPatch.js";

export async function WelcomeSource()
{//The old splash card runs in a native popup; the tour prompt keeps its task.
  let [source,logo]=await Promise.all([
    fetch(new URL("./Welcome.HC",import.meta.url)),
    fetch(new URL("./Welcome.DAT",import.meta.url))]);
  if (!source.ok || !logo.ok) throw Error("Could not load the welcome card.");
  return "U8 *welcome_logo="+HolyCStr(new Uint8Array(await logo.arrayBuffer()))+
    ";\n"+await source.text()+"\nPopUp(\"WinFocus;Welcome;\");\n";
}
