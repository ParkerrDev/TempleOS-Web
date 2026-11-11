import assert from 'node:assert/strict';

export function WadRead(bytes)
{
  assert.equal(bytes.toString('ascii',0,4),'IWAD');
  const count=bytes.readUInt32LE(4),offset=bytes.readUInt32LE(8),lumps=[];
  assert(count>0&&count<=8192&&offset+count*16<=bytes.length);
  for (let i=0;i<count;i++) {
    const at=offset+i*16,start=bytes.readUInt32LE(at),size=bytes.readUInt32LE(at+4);
    assert(start+size<=bytes.length);
    const name=bytes.toString('ascii',at+8,at+16).replace(/\0.*$/s,'');
    lumps.push({name,start,size,bytes:bytes.subarray(start,start+size)});
  }
  return lumps;
}

export function MapRead(lumps,index)
{
  const record=(n,name,size,read)=>{
    const lump=lumps[index+n];
    assert.equal(lump.name,name);
    assert.equal(lump.size%size,0);
    return Array.from({length:lump.size/size},(_,i)=>read(lump.bytes,i*size));
  };
  const pair=(b,p)=>[b.readInt16LE(p),b.readInt16LE(p+2)];
  return {
    name:lumps[index].name,index,
    things:record(1,'THINGS',10,(b,p)=>[...pair(b,p),b.readInt16LE(p+4),
      b.readUInt16LE(p+6),b.readUInt16LE(p+8)]),
    lines:record(2,'LINEDEFS',14,(b,p)=>Array.from({length:7},(_,i)=>b.readUInt16LE(p+i*2))),
    sides:record(3,'SIDEDEFS',30,(b,p)=>({x:b.readInt16LE(p),y:b.readInt16LE(p+2),
      sector:b.readUInt16LE(p+28)})),
    vertices:record(4,'VERTEXES',4,pair),
    segs:record(5,'SEGS',12,(b,p)=>Array.from({length:6},(_,i)=>b.readUInt16LE(p+i*2))),
    subsectors:record(6,'SSECTORS',4,(b,p)=>[b.readUInt16LE(p),b.readUInt16LE(p+2)]),
    nodes:record(7,'NODES',28,(b,p)=>({origin:pair(b,p),delta:pair(b,p+4),
      children:[b.readUInt16LE(p+24),b.readUInt16LE(p+26)]})),
    sectors:record(8,'SECTORS',26,(b,p)=>({floor:b.readInt16LE(p),ceil:b.readInt16LE(p+2),
      floorName:b.toString('ascii',p+4,p+12).replace(/\0.*$/s,''),
      ceilName:b.toString('ascii',p+12,p+20).replace(/\0.*$/s,'')})),
  };
}

export function SubsectorAt(map,x,y)
{
  if (!map.nodes.length) return 0;
  let index=map.nodes.length-1,steps=0;
  while (!(index&0x8000)) {
    assert(++steps<=map.nodes.length,'BSP cycle');
    const node=map.nodes[index],[nx,ny]=node.origin,[dx,dy]=node.delta;
    let side;
    if (!dx) side=x<=nx?dy>0:dy<0;
    else if (!dy) side=y<=ny?dx<0:dx>0;
    else side=(y-ny)*dx>=(x-nx)*dy;
    index=node.children[Number(side)];
  }
  return index&0x7FFF;
}
