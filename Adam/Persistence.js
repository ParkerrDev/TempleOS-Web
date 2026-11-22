const KEY="tos-persistence";
let cfg={syncTabs:true,saveSession:false,saveWindows:false};
try {
  const saved=JSON.parse(localStorage.getItem(KEY));
  for (const key in cfg)
    if (typeof saved?.[key]==="boolean") cfg[key]=saved[key];
} catch {}

export function PersistenceCfg(change)
{
  if (change) {
    for (const key in cfg)
      if (typeof change[key]==="boolean") cfg[key]=change[key];
    try {localStorage.setItem(KEY,JSON.stringify(cfg));}
    catch {
      dispatchEvent(new CustomEvent("persistenceerror",{detail:
        "Settings changed for this visit; browser storage is unavailable."}));
    }
    dispatchEvent(new CustomEvent("persistencesettings",{detail:{...cfg}}));
  }
  return {...cfg};
}
