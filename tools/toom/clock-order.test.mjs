import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {root} from './Assets.mjs';
import {ToomText} from './Package.mjs';
import {ClockReference} from './ClockRef.mjs';

const backend=process.env.BACKEND||'qemu';assert(['qemu','hemu'].includes(backend));
const rows=await ClockReference(),values=[rows.length,...rows.flat()],packed=Buffer.alloc(values.length*8);
values.forEach((v,i)=>packed.writeBigInt64LE(BigInt(v),i*8));
const game=resolve(root,'games/Toom');
let source=ToomText(name=>!['TmActions','TmLevel'].includes(name) && name!=='TmTick');
const tick=readFileSync(resolve(game,'TmTick.HC'),'latin1'),split=tick.indexOf('I64 LevelTick(');assert(split>0);
source+='\n'+tick.slice(0,split)+`
I64 tm_clock_order_done=0,tm_clock_order_cases=0,tm_clock_order_cnt,
        tm_clock_order_calls[6],tm_clock_order_buttons;
Weapon *tm_clock_order_weapon;
Specials *tm_clock_order_specials;
Surfaces *tm_clock_order_surfaces;
U0 TmClockRecord(I64 n)
{
  World *world=tm_clock_order_weapon->motion->world;
  if (!world->ticking || tm_clock_order_cnt>=6) throw('Phase');
  tm_clock_order_calls[tm_clock_order_cnt++]=n;
  tm_clock_order_calls[tm_clock_order_cnt++]=world->tic;
}
U0 TmClockPlayer(Weapon *weapon,U0 (*use)(Actor *,U8 *),
        U0 (*sector)(Actor *,U8 *),U8 *context)
{
  if (weapon!=tm_clock_order_weapon || context!=tm_clock_order_specials ||
        use!=&TickPlayerUse || sector!=&TickPlayerSector) throw('Args');
  TmClockRecord(1);
}
U0 TmClockThink(Specials *specials)
{
  if (specials!=tm_clock_order_specials) throw('Args');
  TmClockRecord(2);
}
U0 TmClockSurface(Surfaces *surfaces,I64 tic)
{
  if (surfaces!=tm_clock_order_surfaces ||
        tic!=tm_clock_order_weapon->motion->world->tic) throw('Args');
  TmClockRecord(3);
}
U0 TmClockButton(Switches *switches)
{
  if (switches!=tm_clock_order_specials->switches || tm_clock_order_cnt!=6)
    throw('Buttons');
  tm_clock_order_buttons++;
}
#define PlayerTick TmClockPlayer
#define ThinkersTick TmClockThink
#define SurfacesTick TmClockSurface
#define ButtonsTick TmClockButton
`+tick.slice(split)+`
U0 TmClockOrderTest()
{
  I64 *body=FileRead("C:/ORACLE/CLOCK.BIN"),*row,i,j;
  World world;
  Motion motion;
  Weapon weapon;
  Specials specials;
  Sectors sectors;
  Surfaces surfaces;
  Graphics graphics;
  Map map;
  MemSet(&world,0,sizeof(World)); MemSet(&motion,0,sizeof(Motion));
  MemSet(&weapon,0,sizeof(Weapon)); MemSet(&specials,0,sizeof(Specials));
  MemSet(&sectors,0,sizeof(Sectors)); MemSet(&surfaces,0,sizeof(Surfaces));
  if (!body) throw('Files');
  world.map=&map; motion.world=&world; weapon.motion=&motion;
  sectors.motion=&motion; sectors.graphics=&graphics;
  specials.sectors=&sectors; surfaces.map=&map; surfaces.graphics=&graphics;
  tm_clock_order_weapon=&weapon; tm_clock_order_specials=&specials;
  tm_clock_order_surfaces=&surfaces;
  for (i=0,row=body+1;i<body[0];i++,row+=10) {
    if (!(i&3)) world.tic=row[0];
    if (world.tic!=row[0]) throw('Before');
    tm_clock_order_cnt=tm_clock_order_buttons=0;
    MemSet(tm_clock_order_calls,0xFF,sizeof(tm_clock_order_calls));
    if (LevelTick(&weapon,&specials,&surfaces,row[1]) ||
          world.tic!=row[2] || world.ticking ||
          tm_clock_order_cnt!=row[3] || tm_clock_order_buttons!=!row[1])
      throw('Clock');
    for (j=0;j<6;j++)
      if (tm_clock_order_calls[j]!=row[4+j]) throw('Order');
    tm_clock_order_cases++;
  }
  Free(body); tm_clock_order_done=1;
  "CLOCK ORDER %d CASES BAD 0\\n",tm_clock_order_cases;
}
TmClockOrderTest;
`;
const files=[{name:'CLOCK.BIN',bytes:packed}];
if(backend==='qemu') {
  assert(process.env.HOLYC_WASM,'Set HOLYC_WASM to the checkout containing the native oracle.');
  const {QemuRun}=await import(pathToFileURL(resolve(process.env.HOLYC_WASM,'tests/oracle/Qemu.mjs')));
  const result=await QemuRun([Buffer.from(source,'latin1')],{files,timeout:120});
  console.log(JSON.stringify(result,null,2));assert.equal(result.results[0].except,'');
  assert.doesNotMatch(result.results[0].out,/WARNING/);
  assert.match(result.results[0].out,/CLOCK ORDER 256 CASES BAD 0/);
} else {
  assert(process.env.TEMPLEOS_WEB,'Set TEMPLEOS_WEB to the checkout with built HEMU dependencies.');
  const {GuestHarness}=await import(pathToFileURL(resolve(process.env.TEMPLEOS_WEB,'tools/hemu/GuestHarness.mjs')));
  const h=await GuestHarness({disk:true});
  for(const file of files) {
    const id=h.gx.writeFile({path:`C:/ORACLE/${file.name}`,bytes:file.bytes});
    for(let i=0;i<4000&&!['done','failed','error'].includes(h.gx.status(id)?.state);i++)await h.Run();
    assert.equal(h.gx.status(id)?.state,'done',JSON.stringify(h.gx.status(id)));
  }
  await h.Exec(source);
  for(const [name,n] of [['done',1],['cases',256]])
    assert.equal(h.gx.rd64(h.gx.varFind(`tm_clock_order_${name}`)),n);
  console.log(JSON.stringify({backend,cases:256,bad:0},null,2));
}
