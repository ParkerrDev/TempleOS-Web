import {FMT_EXPORTS} from "../holyc-fmt/Fmt.js";
import {readFile,mkdir,writeFile} from "node:fs/promises";
import {compileHolyC} from "../hemu/holyc-wasm/src/compiler.js";

const root=new URL("../",import.meta.url),programs=[
  ["holyc-fmt/HolyCFmt.HC",FMT_EXPORTS],
  ["Apps/Sprites/Gr.HC",["SpriteGrRead","SpriteGrWrite","SpriteGrError",
    "SpriteGrMax","MAlloc","Free","StrLen"]],
  ["Apps/Search/Query.HC",["SearchQuery","MAlloc","Free","StrLen"]],
  ["Apps/Search/Clip/Mp4.HC",["ClipPlan","ClipReadPos","ClipReadSize",
    "ClipReadPut","ClipResult","ClipResultSize","ClipError","ClipScan",
    "ClipMetaSize"]],
  ["Apps/Search/Clip/Mkv.HC",["MkScan","MkScanSize","MkScanHead","MkMeta",
    "MkSeekPos","MkPlan","MkReadStart","MkReadEnd","MkClusterPut",
    "MkFinish","MkResult","MkResultSize","MkStart","MkEnd","MkError"]],
  ["Apps/God/GodBits.HC",["GodFifoRst","GodBitsIns","GodBits"]]
];
await mkdir(new URL("build/",root),{recursive:true});
for (const [path,exports] of programs) {
  const filename=path.split("/").pop(),
    source=await readFile(new URL(path,root),"latin1"),
    compiled=compileHolyC(source,{filename,lenient:false,resilient:false,exports});
  if (compiled.warnings.length || compiled.diagnostics.length)
    throw new Error(path+": "+[...compiled.warnings,...compiled.diagnostics].join("\n"));
  const output="build/"+filename.replace(/\.HC$/,".wasm");
  await writeFile(new URL(output,root),compiled.bytes);
  console.log(output+": "+compiled.bytes.length+" bytes");
}
