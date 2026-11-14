import {FmtNew,FmtText} from "../../holyc-fmt/Fmt.js";

let formatter;

async function FmtLoad()
{
  if (!formatter) {
    formatter=Promise.all([
      import("../../hemu/holyc-wasm/src/runtime/host.js"),
      fetch(new URL("../../build/HolyCFmt.wasm",import.meta.url))
    ]).then(async function ([host,response]) {
      if (!response.ok)
        throw new Error("Could not load the formatter ("+response.status+").");
      return FmtNew(new Uint8Array(await response.arrayBuffer()),host.createHost);
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
