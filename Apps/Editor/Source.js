export function sourceString(buffer,utf8=false) {
  const bytes=new Uint8Array(buffer);
  if(utf8)return new TextDecoder().decode(bytes);
  let text='';
  for(let start=0;start<bytes.length;start+=8192)
    text+=String.fromCharCode(...bytes.subarray(start,start+8192));
  return text;
}

// TempleOS documents are byte strings followed by optional binary sprite records.
// Keep the records outside the textarea and append them unchanged on export.
export function sourceDocument(buffer,utf8=false) {
  const bytes=new Uint8Array(buffer),zero=utf8?-1:bytes.indexOf(0);
  const end=zero<0?bytes.length:zero;
  const text=sourceString(bytes.subarray(0,end),utf8);
  const original=text.replace(/\r\n?/g,'\n');
  return {
    original,utf8,hasSprites:zero>=0,
    encode(source) {
      if(source===original)return bytes.slice().buffer;
      if(source.includes('\0'))throw new Error('The source cannot contain a NUL character.');
      if(utf8)return new TextEncoder().encode(source).buffer;
      const prefix=new Uint8Array(source.length);
      for(let i=0;i<source.length;i++){
        const code=source.charCodeAt(i);
        if(code>255)throw new Error(`TempleOS source uses 8-bit characters. Replace ${JSON.stringify(source[i])} before running or saving.`);
        prefix[i]=code;
      }
      const output=new Uint8Array(prefix.length+bytes.length-end);
      output.set(prefix);output.set(bytes.subarray(end),prefix.length);
      return output.buffer;
    },
  };
}
