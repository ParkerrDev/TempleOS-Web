export function KeyQueue()
{//Track physical set-1 makes so blur can release every key, including E0 keys.
  const queue=[],held=new Set();
  let prefix=0,pause=0;
  function Push(bytes)
  {
    for (let sc of bytes) {
      sc&=255;
      queue.push(sc);
      if (pause) pause--;
      else if (sc==0xE1) {pause=5;prefix=0;}
      else if (sc==0xE0) prefix=0x100;
      else {
        const key=(sc&127)|prefix;
        prefix=0;
        if (sc&128) held.delete(key);
        else held.add(key);
      }
    }
  }
  function Release()
  {
    for (const key of held) {
      if (key&0x100) queue.push(0xE0);
      queue.push((key&127)|128);
    }
    held.clear();
    prefix=pause=0;
  }
  return {Push,Release,Read:()=>queue.length?BigInt(queue.shift()):-1n};
}
