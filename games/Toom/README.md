# Native TOOM work in progress

This directory contains the new TempleOS implementation. It is not yet a
playable game and does not replace the existing catalog entry. The old port is
preserved in `../upstream/TOOM` with its original provenance.

The implemented foundation uses native V5.03 file and memory APIs:

- A validated IWAD directory and bounded byte-range reads. Startup does not
  assemble, rewrite or read the entire WAD. Reads split the first FAT cluster
  before bulk access to avoid the native CFile cached-cluster edge case.
- All original map records, BSP point queries, blockmap validation and explicit
  per-level ownership. Invalid indices, cycles and truncated records are
  rejected before use. Self-referencing sectors and absent back sides found in
  the real Freedoom maps are retained. Packed 26-byte sector records decode
  once into runtime Q16 heights, preserving fractional floors and ceilings.
- Lazy indexed patch decoding, tall patch posts, clipped texture composition
  and an 8 MiB texture cache. Sprites and textures are not enlarged to 2×2
  pixels or all decoded at startup.
- A 90,764-byte immutable data pack with all 967 canonical states, 137 actor
  types, nine weapon animation/ammo records, the original deterministic random stream and Freedoom's five
  full-bright firing-frame and two shotgun-flash duration corrections. A native
  state clock handles action callbacks, zero-tic transitions and permanent
  states independently of drawing. The original sine/cosine and angle tables
  make simulation math deterministic without startup table generation.
- Native BSP traversal, near-plane clipping, perspective wall columns, portal
  clipping and horizontal floor/ceiling spans. Original COLORMAP data supplies
  light and distance shading. Indexed pixels become 2×2 TempleOS palette
  patterns in a private CDC; window composition uses the OS graphics layer.
- Lazy sprite frame/rotation indexing, mirrored patch origins, transparent
  pixels, full-bright and distance lighting, sector clipping and per-pixel
  wall/sprite depth tests. Sky boundaries retain invisible depth barriers.
  A separate 4 MiB decoded sprite cache evicts before
  allocation. Sprites are not decoded until requested.
- Masked middle-wall textures use shared wall projection, preserve transparent
  holes and top/bottom pegging, and clip against nearer walls and objects.
- Fixed-point map collision uses the original blockmap, stable side/tie rules,
  line flags, portal headroom, 24-unit steps and dropoffs. Successful position
  queries retain touched special lines for the later movement/action stage.
- World-owned actors use stable allocations and generation handles. Map
  spawning honors skill, ambush, ceiling placement, deterministic state timers
  and the canonical RNG sequence. The block lists respect NOBLOCKMAP, and
  NOSECTOR objects remain invisible. A separate thinker list preserves update
  order when a new actor reuses an earlier handle slot.
- Actor contact queries preserve missile source/species rules, skull impacts
  and pickup-before-wall ordering. The spatial query accommodates large actors;
  contact callbacks defer reclamation until the end of the tic. Nested contact
  queries restore the outer collision context before checking walls.
- Position changes commit actor coordinates, sector bounds and block links
  together. Crossed-line callbacks run afterward in reverse contact order;
  nested queries cannot overwrite the pending line list.
- Texture coordinates, increments and lighting buckets use nearest Q16 values
  with even ties. This defines sampling at texel and light boundaries across
  native x87 and HEMU. Sky row coordinates are computed once per row.
- Path queries visit every touched block edge/corner and nearby actor cells.
  Exact integer intersections produce ordered Q16 fractions; walls win ties
  with actor cross-sections. A reusable path owns its buffers and borrows its
  world, and must be freed before that world.

- Wall sliding traces three leading corners, projects the remaining move with
  integer angle tables and bounds corner retries. Actor obstructions use the
  classic separate-axis fallback, and crossed-line/contact callbacks remain
  effective during a slide.

- A motion context owns its reusable path and borrows the level and persistent
  player view state. Fixed-tic motion covers friction, gravity, speed limits,
  smooth steps, landing effects, floating actors, skull charges and missile
  impacts. State/sound/contact/line effects use native callbacks.

- Native weapon traces narrow the aim cone through portals and return the
  nearest shootable target or wall/sky impact. Ordered shot-trigger lines are
  collected before effects, so querying does not mutate the world.

- Damage applies skill scaling, armor, invulnerability, thrust, pain and
  retaliation. Deaths update corpse geometry and kill totals, enter canonical
  death/overkill states and spawn the appropriate dropped items.

- Pickups update persistent health, armor, ammo, weapons, keys and powers.
  They honor capacity and height limits, dropped-item amounts, skill bonuses,
  weapon auto-selection and one-time backpack expansion. Accepted items retire
  at the tic boundary; a new life retains level counters.

- Hit effects use deterministic blood/puff states and jitter. Applying a shot
  snapshots its target and trigger list before callbacks, so nested attacks
  cannot overwrite it. Trigger buffers are freed on both return and exception.
  Native projectiles use source handles, portal-aware auto-aim and an atomic
  initial half-step through the ordinary contact/movement code.

- Weapon and flash overlays run their canonical state clocks at 35 Hz. All
  22 weapon actions connect firing, melee, projectiles, ammo, sounds and light
  requests. Weapon changes wait for the animation; refiring follows each
  weapon's state sequence. Drawing and audio playback remain separate work.

- Player commands apply fixed-tic turning and ground thrust, use-button edges,
  weapon selection, view bob/step recovery, timed powers and death/respawn state.
  Airborne views remain below the ceiling. Sector/use callbacks precede weapon
  and power clocks; actor motion and state updates follow them.

- Actor sight applies REJECT and narrows the target height interval through
  exact line-only path queries. Splash damage snapshots nearby actor handles,
  checks visibility, and preserves boss immunity and self-damage. BFG spray
  fires its forty canonical rays from the current firer position.

- A compact sector-edge index supplies bounds and adjacent sectors. Q16 moving
  planes preserve destination timing, grounded/airborne clipping, blocked
  rollback, crush damage/blood and corpse/dropped-item handling. New thinkers
  wait until the next query. Exceptions restore plane heights and actor bounds
  without repeating callbacks; already-applied game effects are retained.

- Door controllers support normal and fast raise/open/close cycles, thirty-second
  close/reopen and five-minute delayed opening, front-side manual use, tagged
  activation, both key forms for each color, monster/secret restrictions and
  obstruction reversal. One controller owns each sector; new controllers wait
  until the next tic and retired nodes free after callbacks. Sound and missing
  key requests are callbacks for the eventual native UI/audio implementation.
  Delayed closing doors initialize their reopening height and wait, correcting
  uninitialized fields in the legacy source. Isolated doors retain their ceiling,
  and an opening destination cannot go below the floor.

Fuzz effects, the full simulation loop, actor actions, line dispatch, HUD,
audio, saves and episode/intermission progression are still being implemented.
There is deliberately no game launcher or advertised compatibility result yet.

## Assets

The default is the unmodified official Freedoom 0.13.0 Phase 1 IWAD. The
release restores vanilla Doom compatibility, avoiding an unnecessary Boom
compatibility layer. Its SHA-256 is
`7323bcc168c5a45ff10749b339960e98314740a734c30d4b9f3337001f9e703d`.
Preparation downloads the pinned official ZIP once, verifies both the ZIP and
IWAD digests, and writes the local game asset outside game startup:

```sh
node tools/toom/Assets.mjs
```

Alternatively set `FREEDOOM_WAD` to that release's `freedoom1.wad`. The prepared
`FREEDOOM.WAD` and download cache are ignored by Git. Distribute the matching
`Freedoom-COPYING.txt` alongside the IWAD. Both official release notices and
checksums are retained under `tools/toom/`; the historical port's modified
notice is not used.

The existing seven 0.12.1 chunks remain untouched. Set `FREEDOOM_VERSION=0.12.1`
to run loader/render regression checks on those bytes. That older release
contains Boom map specials and is not the new game's gameplay target.
`Data.mjs` uses the selected release's DEHACKED changes; rerun it to deliberately
switch the generated state pack. `data.json` records the release and IWAD hash.

`TMDATA.BIN` (format 3) is generated by `node tools/toom/Data.mjs` from a hash-pinned
revision of id Software's GPL-2-licensed state and actor data. The generator
retrieves and verifies the original source; it does not build or include a C
engine. See `NOTICE`, `COPYING` and `tools/toom/source/source.json` for the
specific changes, attribution and corresponding source. The native engine and
derived state data use GPL version 2; the Freedoom content keeps its separate
BSD license.

## Native regression checks

Set `HOLYC_WASM` to the compiler checkout containing `tests/oracle/Qemu.mjs`.
The oracle compiles and runs these sources in original TempleOS V5.03 under
QEMU with a private disk; it does not compile them with HolyC-wasm.

```sh
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/io.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/map.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/sector-index.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/sector.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/door.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/patch.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/texture.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/state.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/math.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/sprite.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/mask.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/collision.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/world.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/contact.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/movement.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/path.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/slide.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/motion.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/attack.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/damage.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/items.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/impact.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/weapon.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/player.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/blast.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/sight.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm ALL=1 node tools/toom/draw.test.mjs
```

The I/O check exercises 526 overlapping and repeated byte ranges, including
short headers followed by multi-cluster bodies, with guarded buffers.
The map check covers all 36 maps and 103,909 actor/partition queries, comparing
native results and every decoded sector value to an independent host reader.
It also corrupts record indices,
alignment, BSP links, blockmap offsets and lump ranges to verify rejection.
The patch check compares 2,233 decoded patches, sprites and interface graphics
(15,109,811 indexed pixels) against the host reader. The texture check compares
all 963 composite textures and exercises cache hits and eviction/reload.
The state check advances all 967 states through 116,040 total tics with action
callbacks, checks three full random-stream cycles and rejects invalid next-state
indices. It checks the clock and data, not yet the effects of actor actions.
The math check covers 16,384 original sine/cosine samples and 4,457 edge/random
fixed-point arithmetic and angle vectors, including distant vectors and
saturation limits. It rejects malformed trigonometry tables.
It also compares 8,594 wide products/signed product orderings and 4,128 unit
fractions with independent BigInt results, including signed and unsigned limits
and products differing by one beyond floating-point precision.
The sprite check compares 7,736 state/rotation lookups, two full passes through
853 decoded images and 49 pixel/depth views. It covers mirrored images, alpha,
light/fullbright, sector clipping and nearer occluders. Absent Phase 2 sprite
frames remain absent; validating gameplay-reachable state assets is a later gate.
The masked-wall check compares 96 full pixel/depth views, covering oblique and
near-clipped segs, top/bottom pegging, scroll offsets, holes, reverse faces and
opaque/sky occluders.
Quarter-unit floors and half-unit ceilings are checked on native TempleOS and
HEMU. Wall projection hoists height/view calculations out of the column loop.
The collision check compares 68,035 fixed-point queries across all 36 maps
with an independent full-linedef scan, including player, monster, missile,
teleport, floating and noclip flags. It checks passability, sectors, headroom,
steps/dropoffs and contacted specials. Crossed-line effects remain part of the
pending simulation stage.
The world check covers 108 map/skill combinations and 37,779 initial actors,
including exact spawn state/timers, RNG, flags, positions and totals. It also
checks linked block lists, stable allocation through table growth, stale
handles, slot reuse and out-of-map unlinking. Actual actor actions remain part of the pending simulation stage.
The contact check covers 1,756 interaction cases and 1,024 spatial queries
against a full actor scan. It checks large actors across block cells, vertical
missile separation, source/species immunity, skull impacts, deferred pickup
callbacks, stale handles and contact ordering. Actual damage and inventory
effects are checked by the damage and inventory fixtures.
The movement check covers 27 position-change contracts in a controlled pair
of rooms: step/dropoff/headroom boundaries, float/teleport/noclip flags, atomic
rejection, actor links, pickup contacts and crossed-line ordering, including
callbacks that perform another query or throw after the position commits.
Step and headroom tests include one-Q16-unit boundaries.
Actual line actions remain part of the pending simulation stage.
The path check compares all hit records for 5,012 rays across the 36 maps and
an independent full geometry/actor scan. It includes long rays, exact grid and
vertex boundaries, large actors in neighboring cells, wall/actor ties, all four
exact diagonals, allocation growth, stamp reset and reused actor handles.
The sliding check covers 19 cases for axis and diagonal walls, corners, actor
obstructions, 25-unit steps, headroom, blocking flags and action callbacks.
It also compares 1,024 projected moves with an independent integer reference.
The motion check covers 35 contracts for signed substeps and odd deltas,
friction/stop thresholds, speed limits, sliding, gravity, view steps, hard/soft
landings, floating/skull actors, missile explosions and sky suppression.
Fast movement splits both signs and preserves the exact integer displacement;
wall sliding consumes only the uncommitted remainder. These explicitly correct
legacy directional splitting and repeated movement, rather than promise demo
synchronization. The state clock remains separate from motion.
The attack check covers 35 cases for all eight aiming octants, range,
shootable/nearer actors, floor/ceiling portal limits, exact closed-door
boundaries, sky impacts and 41 ordered line triggers through buffer growth.
The separate impact stage applies shot damage and line callbacks.
The damage check covers 4,752 player boundaries for health, armor, difficulty,
invulnerability, god mode and the end-sector survival rule, plus 20 focused
monster cases for thrust, pain/retaliation, skulls, corpse flags, overkill,
item drops and callback removal. Invalid zero-mass actor data is rejected.
Weapon actions are checked separately; actor action dispatch remains unfinished.
The inventory check covers 2,304 independent ammo/auto-selection combinations
and 52 pickup/respawn cases, including all item families, duplicate/full
inventories, powers, dropped weapons, reach, and pickup during a blocked move.
The data loader rejects the unused ammo enum marker, invalid weapon states and
older pack formats. Powers are granted here; their countdown and visible/audio
effects remain part of the unfinished game loop.
The impact check covers 18 effect/projectile cases, including all three player
missiles, source immunity, auto-aim, close-wall explosions, nested line actions,
stale targets and repeated exception cleanup. Intentional test exceptions skip
Adam logging so the heap assertion measures the owned trigger buffer.
The weapon check covers 13,824 independently computed ammo/owned-weapon
selections and 35 animation/combat cases. Nine 200-tic firing schedules match
canonical shot intervals and ammunition costs; every weapon action is reached.
It also checks flash completion, trigger rearming, switching/death, zero-tic
states, callback replacement/cleanup, exact pellet counts and melee damage.
Automatic selection uses enough ammo for a complete shot, including exactly
two shells or 40 cells; it does not preserve legacy strict-greater quirks.
The player check covers 1,500 independent movement/turn vectors and 181 cases
for view limits, power expiry, use edges, teleport freezes, weapon requests,
chainsaw thrust, death facing/respawn and movement through the actual collision
and state clocks. Angle wrap and death during weapon windup have regressions.
The static renderer still matches all 288 native map views after these modules
are included; this does not measure a complete game's frame rate.
The blast check covers 256 independently calculated portal-height cases and
23 visibility/splash/BFG contracts, including radius boundaries, boss immunity,
self-damage, exception cleanup and forty BFG effects with exact RNG/damage.
The sight check compares 6,912 rays across all 36 maps with an independent
full-linedef scan, including REJECT and 927 visible pairs. These are actor
combat foundations; the actor action dispatcher is still unfinished.
The sector fixtures cover 430 movement/contact contracts, including fractional
steps, strict destination completion, crush cadence, callbacks that spawn or
retire actors, nested queries and exception recovery. An independent map scan
checks all 14,556 sector bounds and 127,943 indexed edges across 36 maps. Moving
planes allocate no per-tic scratch memory. The door fixture adds 14,873 checks:
12,778 individual tics across eight source-defined cycles, all 1,024 manual and
remote key-mask combinations, obstruction/delayed reopening, controller ownership,
spawn/removal and exception cleanup. Full floor/lift/ceiling controllers and
line dispatch remain unfinished.
Set `BACKEND=hemu TEMPLEOS_WEB=/path/to/TempleOS-Web` to run path, math, sliding,
motion, attack, damage, inventory, impact, weapon, player, blast, sight, sector or door checks using the original TempleOS compiler and file I/O under HEMU.
The draw check compares wall/plane depth against independently traced map segs
at eight poses in each of 36 maps, including exact BSP/sky boundary cases.
It guards the pixel, depth, plane and clipping buffers and verifies private
CDC row padding and margins. Omit `ALL=1` to check E1M1, or set `MAP=E2M3`.
These checks establish loader and decoding behavior; they do not establish
gameplay, display-frame performance or parity with every hypervisor.

The design and audit are recorded in `untangle/survey/toom.md` in the parent
workspace. Measured evidence is recorded there as each stage is completed.

## Native renderer preview

```sh
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/preview.mjs
```

This compiles the current sources in original TempleOS and writes
`/tmp/toom-E1M1.png`. Set `MAP=E2M3` or `OUT=/path/view.png` as needed. It renders
the original player-start view and medium-skill map sprites in their initial
states. It is a static renderer preview, with no actor actions, weapon/HUD or
player simulation, and must not be presented as a playable game.

## Native and HEMU renderer comparison

```sh
HOLYC_WASM=/path/to/HolyC-wasm ALL=1 N=1 OUT=/tmp/toom-native.json node tools/toom/time.mjs qemu
TEMPLEOS_WEB=/path/to/TempleOS-Web ALL=1 N=1 REFERENCE=/tmp/toom-native.json node tools/toom/time.mjs hemu
```

This compares eight player-start viewing angles in each of the 36 maps, using
actual map actors, wall/plane textures, masked walls, sprites and private EGA
output. It rejects differences in frame hashes, asset reads, cache sizes or
actor counts, and requires the same source hash. It uses the ordinary guest
file-upload path and a private disk overlay. `OUT` preserves the measured
result even when comparison fails.

Omit `ALL=1` for E1M1, or set `MAP=E2M3`. The default 30 repeats per view is
intended for timing; `N=1` is sufficient for image comparison. Native times use
the guest's real clock under QEMU/KVM. HEMU times use elapsed host time, including
job dispatch amortized over the repeats. Asset preparation and emulator startup
are excluded; source compilation, first frame and steady rendering are reported
separately. These are static-scene renderer measurements, not full-game FPS.

`DUMP=/tmp/toom-pixels DUMP_POSE=2` saves raw 640 by 336 EGA bytes for one map.
`TRACE=1 TRACE_X=122` records raw wall-coordinate bits before Q16 conversion;
diagnostic traces are excluded from ordinary timing. `GAME_DIR` selects another
source directory for matched before/after measurements.

The initial comparison exposed native x87 cosine/extended-arithmetic differences
in HEMU. Examples and Intel's explanation of x87 trigonometric argument
reduction are retained in `tools/toom/fpu-evidence.json`. The common sampling
rule resolves the tested renderer differences; it does not establish exact
x87 semantics or universal cross-platform equivalence.

The runtime-sector change is recorded in `tools/toom/sector-evidence.json`.
All 288 static images remain exact. Three matched timing pairs put native and
HEMU medians within 0.8% of the prior implementation, inside the observed run
variation; this does not establish a complete game's frame rate.
