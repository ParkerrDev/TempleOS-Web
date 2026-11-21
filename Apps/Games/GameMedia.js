//An original game disk stays in this tab and is copied to the selected runner.
const disks=new Map();

export async function readGameDisk(file,media) {
  if(file.size>2*media.bytes)throw Error("Choose the PCjr floppy image or its ZIP.");
  let bytes=await file.arrayBuffer();
  if(new DataView(bytes).byteLength>=4 && new DataView(bytes).getUint32(0,true)===0x04034b50) {
    const v=new DataView(bytes),end=v.byteLength-22;
    let e=end;
    while(e>=Math.max(0,end-65535) && v.getUint32(e,true)!==0x06054b50)e--;
    if(e<0 || v.getUint32(e,true)!==0x06054b50)throw Error("Incomplete ZIP directory.");
    let off=v.getUint32(e+16,true),found=false;
    for(let i=0;i<v.getUint16(e+10,true);i++) {
      if(off+46>e || v.getUint32(off,true)!==0x02014b50)throw Error("Invalid ZIP directory.");
      const size=v.getUint32(off+20,true),len=v.getUint16(off+28,true),
        name=new TextDecoder().decode(new Uint8Array(bytes,off+46,len));
      if(name.split('/').pop().toUpperCase()===media.name) {
        const h=v.getUint32(off+42,true),method=v.getUint16(off+10,true);
        if(v.getUint32(off+24,true)!==media.bytes || v.getUint32(h,true)!==0x04034b50)
          throw Error("The disk has the wrong size.");
        const at=h+30+v.getUint16(h+26,true)+v.getUint16(h+28,true);
        if(at+size>off)throw Error("Incomplete ZIP member.");
        bytes=bytes.slice(at,at+size);
        if(method===8){
          const reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
          const out=new Uint8Array(media.bytes);let used=0;
          try {for(;;){const {done,value}=await reader.read();if(done)break;
            if(used+value.length>out.length)throw Error("The disk exceeds its declared size.");
            out.set(value,used);used+=value.length;
          }}finally{await reader.cancel();}
          bytes=out.buffer.slice(0,used);
        }else if(method!==0)throw Error("Unsupported ZIP compression. Choose the extracted IMG.");
        found=true;break;
      }
      off+=46+len+v.getUint16(off+30,true)+v.getUint16(off+32,true);
    }
    if(!found)throw Error("The ZIP does not contain "+media.name+".");
  }
  if(bytes.byteLength!==media.bytes)throw Error("This edition needs the 360 KB PCjr disk.");
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),
    b=>b.toString(16).padStart(2,'0')).join('');
  if(hash!==media.sha256)throw Error("This disk differs from the supported 1984 PCjr edition.");
  return bytes;
}

export async function gameDisk(media) {
  if(!disks.has(media.sha256))disks.set(media.sha256,new Promise((resolve,reject)=>{
    const dialog=document.createElement('dialog'),label=document.createElement('label'),
      input=document.createElement('input'),status=document.createElement('p'),cancel=document.createElement('button');
    label.textContent="Choose your original King's Quest PCjr disk (IMG or ZIP). ";
    input.type='file';input.accept='.img,.zip';label.append(input);cancel.textContent='Cancel';
    status.setAttribute('role','status');dialog.append(label,status,cancel);document.body.append(dialog);
    let accepted=false;
    dialog.addEventListener('close',()=>{dialog.remove();if(!accepted)reject(Error("Disk selection cancelled."));},{once:true});
    cancel.onclick=()=>dialog.close();
    input.onchange=async()=>{if(!input.files.length)return;try{
      const bytes=await readGameDisk(input.files[0],media);
      if(!dialog.open)return;accepted=true;dialog.close();resolve(bytes);
    }catch(e){status.textContent=e.message;input.value='';}};
    dialog.showModal();
  }).catch(e=>{disks.delete(media.sha256);throw e;}));
  const bytes=await disks.get(media.sha256);
  return {path:media.path,sha256:media.sha256,bytes:bytes.slice(0)};
}
