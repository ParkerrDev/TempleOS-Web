#!/usr/bin/env python3
"""Extract supplied KQ PCjr resources and compile every GAL rule to HolyC.

Game data belongs to Sierra. This format reader and translator are original.
Runtime uses extracted assets and generated HolyC, never the executable/disk.
"""
import argparse
import collections
import hashlib
import json
import struct
from pathlib import Path

# Operand widths recovered from the original interpreter's 67 action handlers.
ARGS = [(), (), (1,), (), (1,), (1,), (), (1,), (1,), (1,), (2,),
        (1,), (1,), (1,), (1,1), (1,), (1,), (1,), (1,1), (1,1),
        (1,), (1,), (1,), (1,), (1,1,1), (1,1,1), (1,), (1,), (1,),
        (1,), (1,1), (1,), (1,1,1), (1,1,1), (1,), (1,), (1,), (1,),
        (1,1,1), (1,1,1), (1,), (1,), (), (), (1,), (1,1), (), (1,1),
        (1,1), (), (), (), (1,), (1,), (1,1), (1,), (1,1), (1,), (1,),
        (1,), (1,1), (1,1,2), (2,), (), (1,), (1,), (), ()]
STOP = {4,43,55,64,67}
SHA = '9647acdbadb0b8ebd3af8d19a02cb549dc7282659cde0efe5d15390cafb4af29'

def word(b, off):
    return struct.unpack_from('<H', b, off)[0]

def actions(b):
    result = []
    p = 0
    while p < len(b):
        start = p
        op = b[p]
        p += 1
        if op == 255:
            result.append((start, op, []))
            continue
        assert 1 <= op <= 67, (start, op)
        values = []
        for width in ARGS[op]:
            assert p + width <= len(b)
            values.append(int.from_bytes(b[p:p+width], 'little'))
            p += width
        result.append((start, op, values))
    return result

def rules(b, mode):
    result = []
    p = 0
    while p < len(b):
        start = p
        tag = b[p]
        p += 1
        cond = []
        if tag == 255:
            result.append(dict(at=start, kind='end'))
            assert p == len(b), (mode, 'trailing', p, len(b))
            break
        if tag == 254:
            delta = word(b,p)
            p += 2
            result.append(dict(at=start, kind='jump', target=p+delta))
            continue
        branch = tag == 252 or (mode == 'Input' and tag in (251,253))
        if mode == 'Input' and tag == 253:
            pos = list(b[p:p+4])
            p += 4
            cond.append('KqPos(%s)' % ','.join(map(str,pos)))
        elif tag not in (251,252):
            if mode == 'Input':
                cond.append('KqSaid(%d,%d)' % (tag,b[p]))
                p += 1
            else:
                pos = [tag] + list(b[p:p+3])
                p += 3
                cond.append('KqPos(%s)' % ','.join(map(str,pos)))
        while b[p] != 254:
            var, value = b[p:p+2]
            p += 2
            cond.append('kq_var[%d]%s%d' % (var,'!=' if value & 128 else '==',value & 127))
        p += 1
        arg = word(b,p)
        p += 2
        result.append(dict(at=start, kind='branch' if branch else 'action',
                           cond=cond, **({'target':p+arg} if branch else {'action':arg})))
    assert result and result[-1]['kind'] == 'end'
    starts = {row['at'] for row in result}
    for row in result:
        if 'target' in row and (row['kind'] != 'branch' or row['cond']):
            assert row['target'] in starts, (mode,row,starts)
    return result

def native(room, ins, streams):
    referenced = {r['action'] for rows in streams.values() for r in rows if 'action' in r}
    starts = {i[0] for i in ins}
    assert referenced <= starts, (room,referenced-starts)
    out = ['Bool KqAct%03d(I64 off)' % room, '{', '  kq_text_room=%d;' % room,
           '  switch (off) {']
    for off in sorted(referenced):
        out += ['    case %d:' % off,'      goto ka_%d;' % off]
    out += ['    default:', '      return FALSE;', '  }']
    for off, op, args in ins:
        if off in referenced:
            out.append('ka_%d:' % off)
        if op == 255:
            out.append('  return FALSE;')
        else:
            out.append('  KqAction(%s);' % ','.join(map(str,[op]+args)))
            if op in STOP:
                out.append('  return TRUE;')
    out += ['  return FALSE;', '}', '']
    if not referenced:
        out = []
    for mode, rows in streams.items():
        out += ['Bool Kq%s%03d()' % (mode,room), '{']
        targets = {r['target'] for r in rows if 'target' in r and (r['kind'] != 'branch' or r['cond'])}
        for r in rows:
            if r['at'] in targets:
                out.append('kr_%d:' % r['at'])
            if r['kind'] == 'end':
                out.append('  return FALSE;')
            elif r['kind'] == 'jump':
                out.append('  goto kr_%d;' % r['target'])
            elif r['kind'] == 'branch' and r['cond']:
                inverse = [('!'+v if v.startswith('Kq') else v.replace('!=','==') if '!=' in v else v.replace('==','!=')) for v in r['cond']]
                out += ['  if (%s)' % ' || '.join(inverse),
                        '    goto kr_%d;' % r['target']]
            elif r['kind'] == 'action':
                cond = ' && '.join(r['cond'])
                indent = '  '
                if cond:
                    out.append('  if (%s) {' % cond)
                    indent = '    '
                if mode == 'Input':
                    out.append(indent+'kq_input_matched=TRUE;')
                out += [indent+'if (KqAct%03d(%d))' % (room,r['action']), indent+'  return TRUE;']
                if cond:
                    out.append('  }')
        out += ['}', '']
    return out

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('disk', type=Path)
    parser.add_argument('--words', type=Path, help='Decoded dictionary from original interpreter memory')
    parser.add_argument('--memory', type=Path, help='Original 1 MiB RAM capture, for dictionary and inventory names')
    parser.add_argument('--out', type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    disk = args.disk.read_bytes()
    assert hashlib.sha256(disk).hexdigest() == SHA, 'Unsupported disk revision'
    dest = args.out/'Data'
    dest.mkdir(parents=True,exist_ok=True)
    inventory = {'source_sha256': SHA,'resources':[], 'action_counts':{}, 'fixes':[]}
    def save(name,b,source_offset=None):
        (dest/name).write_bytes(b)
        inventory['resources'].append(dict(name=name,size=len(b),sha256=hashlib.sha256(b).hexdigest(),disk_offset=source_offset))
    all_native = []
    all_ir = []
    freq = collections.Counter()
    for idx in range(256):
        entry = disk[0x500+idx*4:0x504+idx*4]
        if entry in (b'****',b'\0'*4) or idx == 127:
            continue
        pos = (((entry[2]&3)<<8)|entry[3])*512 + entry[0] + ((entry[1]&128)<<1)
        if idx < 90:
            a,i,c,m = struct.unpack_from('<4H',disk,pos)
            total = 8+a+i+c+m
            act = disk[pos+8:pos+8+a]
            idle = disk[pos+8+a:pos+8+a+i]
            inp = disk[pos+8+a+i:pos+8+a+i+c]
            msg = disk[pos+8+a+i+c:pos+total]
            if c == 1 and inp != b'\xff':
                inp = disk[pos+8+a+i-1:pos+8+a+i]
                msg = disk[pos+8+a+i:pos+total]
                inventory['fixes'].append(dict(room=idx,reason='Input/message boundary one byte early; encoded input length includes first message character'))
            ins = actions(act)
            try:
                streams = {kind:rules(buf,kind) for kind,buf in [('Idle',idle),('Input',inp)]}
            except Exception as exc:
                raise ValueError('Room %d: %s' % (idx,exc)) from exc
            for off,op,values in ins:
                if op != 255:
                    freq[op] += 1
                    if op in (10,62):
                        assert values[0] < len(msg), (idx,off,op,values,len(msg))
                    if op == 61:
                        assert values[2] < len(msg)
            all_native.extend(native(idx,ins,streams))
            all_ir.append(dict(room=idx,actions=ins,rules=streams))
            save('MSG%03d.BIN'%idx,msg,pos+total-len(msg))
            end = disk.index(255,pos+total)+1
            save('PIC%03d.BIN'%idx,disk[pos+total:end],pos+total)
        elif idx < 128:
            lengths = struct.unpack_from('<4H',disk,pos)
            save('SND%03d.BIN'%(idx-90),disk[pos:pos+8+sum(lengths)],pos)
        else:
            length = word(disk,pos)+2
            save('VIEW%03d.BIN'%(idx-128),disk[pos:pos+length],pos)
    initial = disk[639*512:639*512+1306]
    assert initial[:6] == b'vrsn#\xff'
    save('INITIAL.BIN',initial,639*512)
    if args.memory:
        ram = args.memory.read_bytes()
        data_base = word(ram,0x600+0x50B)*16
        names = []
        for obj in range(111):
            start = data_base+word(initial,262+obj*8)
            end = ram.index(0,start)
            name = ram[start:end]
            assert len(name) < 40 and all(32 <= ch < 127 for ch in name)
            names.append(name+b'\0')
        save('NAMES.BIN',b''.join(names))
        save('WORDS.BIN',ram[data_base+0x16:data_base+0x16+3263])
        inventory['original_memory_sha256'] = hashlib.sha256(ram).hexdigest()
        inventory['original_data_segment'] = data_base//16
    if args.words and not args.memory:
        words = args.words.read_bytes()
        assert len(words) == 3263
        save('WORDS.BIN',words)
    for mode in ('Idle','Input'):
        all_native += ['Bool Kq%s(I64 room)'%mode, '{', '  switch (room) {']
        for room in range(85):
            all_native += ['    case %d:'%room,'      return Kq%s%03d;'% (mode,room)]
        all_native += ['  }','  return FALSE;','}','']
    lines = []
    for line in all_native:
        indent = len(line)-len(line.lstrip())
        while len(line.expandtabs(8)) > 79 and (' && ' in line or ' || ' in line):
            positions = [line.rfind(op,0,77) for op in (' && ',' || ')]
            split = max(positions)
            if split < 0:
                break
            lines.append(line[:split+3].rstrip())
            line = ' '*(indent+6)+line[split+4:]
        lines.append(line)
    stored = []
    for line in lines:
        spaces = len(line)-len(line.lstrip(' '))
        stored.append('\t'*(spaces//8)+' '*(spaces%8)+line[spaces:])
    (args.out/'Rooms.HC').write_text('\n'.join(stored))
    inventory['action_counts'] = dict(sorted(freq.items()))
    (dest/'Manifest.json').write_text(json.dumps(inventory,indent=2)+'\n')
    (args.out/'Test'/'Rooms.json').write_text(json.dumps(all_ir,separators=(',',':'))+'\n')
    print('Rooms:',len(all_ir),'resources:',len(inventory['resources']),'actions:',sum(freq.values()))
    print('Opcodes:',dict(sorted(freq.items())))
    print('Fixes:',inventory['fixes'])

if __name__ == '__main__':
    main()
