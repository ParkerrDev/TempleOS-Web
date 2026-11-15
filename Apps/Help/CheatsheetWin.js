import {WinAdd,WinFocus,WinFind as $} from "../../Adam/WinMgr.js";

const response=await fetch(new URL("./Cheatsheet.html",import.meta.url));
if (!response.ok) throw new Error("Could not load the TempleOS cheatsheet.");
WinAdd("",await response.text());

function Close()
{
  $("cheatsheetOverlay").classList.remove("open","free");
}

export function Open()
{
  $("cheatsheetOverlay").classList.add("open");
  WinFocus($("cheatsheetWin"));
}

$("cheatsheetClose").addEventListener("click",Close);
$("cheatsheetOverlay").addEventListener("pointerdown",function (e) {
  if (e.target==e.currentTarget) Close();
});
