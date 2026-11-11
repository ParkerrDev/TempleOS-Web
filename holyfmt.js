import {FmtNew,FmtText} from "./holyc-fmt/Fmt.js";

let formatter;

async function FmtLoad()
{
  if (!formatter) {
    formatter=Promise.all([
      import("./holyc-wasm/src/compiler.js"),
      import("./holyc-wasm/src/runtime/host.js"),
      fetch(new URL("./holyc-fmt/HolyCFmt.HC",import.meta.url))
    ]).then(async function ([compiler,host,response]) {
      if (!response.ok)
        throw new Error("Could not load HolyCFmt.HC ("+response.status+").");
      return FmtNew(await response.text(),compiler.compileHolyC,host.createHost);
    }).catch(function (error) {
      formatter=null;
      throw error;
    });
  }
  return formatter;
}

export async function formatHolyC(source,options)
{
  const Format=await FmtLoad();
  return FmtText(Format,source,options);
}
