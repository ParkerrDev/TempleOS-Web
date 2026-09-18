import {compileHolyC} from '../holyc-wasm/src/compiler.js';

function normalize(path){
  const parts=[];
  for(const part of path.replaceAll('\\','/').split('/')){
    if(!part||part==='.')continue;
    if(part==='..'){
      if(parts.length<=1)throw new Error('Include escapes the game project: '+path);
      parts.pop();
    }else parts.push(part);
  }
  return parts.join('/');
}

// Game previews must compile the complete program. Missing kernel APIs are
// errors here, rather than zero-valued globals or skipped function bodies.
export function compileNativeProject({source,filename='program.HC',files=[]}){
  const sources=new Map(files.map(file=>[normalize(file.path).toLowerCase(),{filename:normalize(file.path),source:file.source}]));
  const entry=normalize(filename);sources.set(entry.toLowerCase(),{filename:entry,source});
  const result=compileHolyC(source,{
    filename:entry,lenient:false,resilient:false,projectIncludes:true,
    includeResolver:(path,from=entry)=>{
      const absolute=/^(?:[A-Za-z]:|\/)/.test(path),bases=[''];
      if(!absolute){
        let base=from.slice(0,from.lastIndexOf('/')+1);
        while(base){bases.push(base);base=base.slice(0,base.slice(0,-1).lastIndexOf('/')+1);}
        bases.shift();
      }
      // TempleOS permits extensionless and case-insensitive source names. Nested
      // loaders also include paths relative to an enclosing project directory.
      for(const base of bases)for(const suffix of ['', '.HC', '.HH']){
        const file=sources.get(normalize(base+path+suffix).toLowerCase());
        if(file)return file;
      }
      throw new Error(`${from}: include not in this game project: ${path}`);
    },
  });
  if(result.diagnostics.length||result.warnings.length)throw new Error([...result.diagnostics,...result.warnings].join('\n'));
  return result;
}
