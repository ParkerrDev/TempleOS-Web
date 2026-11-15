import {GrLoad} from './Gr.js';
self.onmessage=async ({data:{frames,width,height,mode,alpha,strength}})=>{
  try {
    const {quantize,toRGBA}=await GrLoad();
    for(let i=0;i<frames.length;i++) {
      const original=frames[i],indices=quantize(original,width,height,mode,alpha,{strength});
      const preview=toRGBA(indices,width,height);
      self.postMessage({type:'frame',index:i,original,indices,preview},[original.buffer,indices.buffer,preview.buffer]);
    }
    self.postMessage({type:'done'});
  }catch(error){self.postMessage({type:'error',message:error.message});}
};
