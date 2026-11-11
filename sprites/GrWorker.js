import {GrBuild} from "./GrBuild.js";

onmessage=async({data})=>{
  try {
    const compiled=await GrBuild(data);
    postMessage(compiled,[compiled.bytes.buffer]);
  } catch (error) {
    postMessage({error:error.message || String(error)});
  }
};
