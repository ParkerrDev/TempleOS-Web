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
- All 22 original flat and wall animation cycles use compact per-level
  translation tables. Captured scrolling lines advance their front sidedefs
  once per simulation tic. Construction reads metadata and allocates one block;
  frames decode only when drawn. Views borrow this state and refresh changed
  sector flat names, including sky transitions, without rereading unchanged
  assets.
- Fixed-point map collision uses the original blockmap, stable side/tie rules,
  line flags, portal headroom, 24-unit steps and dropoffs. Successful position
  queries retain touched special lines for the later movement/action stage.
- World-owned actors use stable allocations and generation handles. Map
  spawning honors skill, ambush, ceiling placement, deterministic state timers
  and the canonical RNG sequence. The block lists respect NOBLOCKMAP, and
  NOSECTOR objects remain invisible. A separate thinker list preserves update
  order when a new actor reuses an earlier handle slot.
- Actors, plane controllers and lights share an embedded native queue in
  creation order. Objects appended by a callback run later in that same pass;
  retired objects are reclaimed after callbacks finish. Map initialization
  interleaves timed doors and lights by sector order and counts secret sectors.
  The thinker pass advances neither the level clock nor rendering. Reentry and
  destruction of live contexts during that pass fail before changing ownership.
- A single-player tic runs player logic, shared thinkers, surface updates and
  buttons before advancing the common level clock. Pause stops that sequence;
  player and weapon bob use the same clock as hazards and animation. Normal and
  secret exits become pending requests, so the active tic finishes before the
  host replaces a level. Reentry and destruction of world-linked owners during
  an active tic fail before releasing memory. Exceptions release the active
  guard while retaining effects that already occurred.
- Per-level hearing uses an owned bounded queue and the shared sector edge
  index. Alerts cross at most one sound-blocking line, stop at closed openings,
  and revisit a sector if an unblocked route improves its first route. Sound
  targets are generation handles. Player search retains the four-slot order;
  ambush, facing, see sounds and melee/missile decisions preserve the original
  branches and random consumption. Chase movement retains diagonal/cardinal
  direction search, octant turns, reaction/target countdowns, attack priority
  and active-sound timing. Failed movement can adjust a floating actor's height
  or use encountered doors in reverse order. Captured lines survive nested
  queries, and temporary storage is released if a callback fails. The complete
  actor action dispatcher is still unfinished.
- Ordinary monster shots retain their sound/facing/aim order, shared shotgun
  slope and per-pellet RNG. Imp, demon, cacodemon, bruiser and revenant melee
  retain their distinct sound and damage order; projectile actions use the
  native actor-targeted launch path. Mancubus volleys preserve the initial
  missile step before spread changes horizontal velocity; lost-soul charge
  preserves sound/flag/facing order and aims at the target center.
  Pain-elemental spawning counts dying skulls, retains the original 21st-skull
  boundary, and sends blocked spawns through ordinary damage/death handling.
  Its three death spawns observe earlier spawns in the same action.
  Revenant launch restores its temporarily raised source height on failure;
  the extra missile step updates spatial ownership. Tracer homing receives the
  persistent game tick explicitly and emits its trail before checking targets.
  Arch-vile resurrection preserves block-column/row/chain order, raw collision
  checks, original crushed-body sizes and the heal/sound/raise sequence.
  Its fire tracks the target facing while visible; the attack retains direct
  damage, vertical launch and radius-blast order. Fire placement refreshes
  spatial ownership, and missing generation handles stop dependent actions.
  Refire checks preserve the early random
  return before health and sight tests. Enemy and player shots pass an explicit
  level context to shootable-line actions; captured impact data survives nested
  callbacks, and exceptions release temporary storage.
- Pain/death/fall actions retain sound variant RNG and boss full-volume origins.
  Footstep actions emit their sound before chase, and corpse fall removes only
  solidity. The player death sound takes an explicit episode/commercial rule.
  Explosion and BFG actions share the checked radius and forty-ray damage paths.
- Boss death actions use explicit episode/map rules and require the living
  single player where the original does. Same-type survivors block victory;
  Keen fall still clears solidity before that check. Numeric sector tags start
  the existing floor/door controllers without fabricating a linedef.
  Brain ending effects retain their full-volume sounds, 65-explosion sweep,
  original fixed-point height offset and random-draw/timer order.
  Brain target collection owns generation handles in thinker order, with no
  fixed 32-target capacity; refreshing targets preserves the easy-mode phase.
- Actor contact queries preserve missile source/species rules, skull impacts
  and pickup-before-wall ordering. The spatial query accommodates large actors;
  contact callbacks defer reclamation until the end of the tic. Nested contact
  queries restore the outer collision context before checking walls.
- Position changes commit actor coordinates, sector bounds and block links
  together. Crossed-line callbacks run afterward in reverse contact order;
  nested queries cannot overwrite the pending line list.
- Teleports resolve tagged sectors and destination thinker order, apply square
  shootable-actor occupancy independently of walls/scenery/height, and preserve
  player telefrags, destination angle/floor, 18-tic freeze and both fog/sound
  events. Nearby actor handles are captured before damage callbacks. Monster
  stomping is an explicit map-rule argument, disabled for Phase 1.
- Switches resolve the forty original texture pairs from metadata, change the
  selected wall field, and restore repeat buttons after 35 tics. Pair/field
  priority and repeated-press timing follow the source. Active buttons use an
  owned list without a sixteen-button cap; sound events use the affected
  sector, including a distinct exit-switch event. No texture is eagerly decoded.
- Sector lights keep the original random flash, synchronized/unsynchronized
  strobe, glow and fire-flicker cycles. Map initialization retains sector-four
  damage while clearing light-only specials. Tagged brightness and strobe
  requests preserve their neighbor, RNG and mover-ownership rules.
- Grounded player sector effects handle the original damage cadence, boot
  protection/leak RNG, secrets and the damaging exit sector. Exit sectors
  clear god mode, preserve invulnerability and record a pending normal exit;
  actual level transition remains separate.
- Use, crossing and shot events dispatch all original line specials. Use traces
  stop at the first special line or closed opening; one-shot/repeat behavior,
  actor permissions, failed actions, keys and normal/secret exit requests retain
  their distinct rules. The context owns its switches and lights, borrowing
  the plane controllers and motion context.
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
  obstruction reversal. One controller owns each sector; new controllers join
  the shared thinker order and retired nodes free after callbacks. Sound and missing
  key requests are callbacks for the eventual native UI/audio implementation.
  Delayed closing doors initialize their reopening height and wait, correcting
  uninitialized fields in the legacy source. Isolated doors retain their ceiling,
  and an opening destination cannot go below the floor.

- Floor controllers implement lowering, nearest/ceiling/24/512-unit raising,
  turbo movement, crushing, lower-and-change and raise-and-change flats/specials,
  and raises by the shortest lower texture. Texture triggers inspect metadata
  without decoding images. Neighbor queries accept every signed map height and
  have no fixed 20-neighbor limit; isolated sectors keep their own floor. Missing
  lower-and-change neighbors preserve the existing flat/special, and destinations
  saturate at the signed Q16 range rather than overflowing.

- Normal and turbo stairs follow directed edges with the same floor flat and
  preserve the source's step ordering around busy branches. Every tagged root
  is considered; ownership stops cycles. Donut triggers validate the hole, ring
  and outer-sector neighbors before starting the paired floor controllers,
  handle either boundary orientation, and never replace a busy ring controller.
  Ring flats/specials change only when the movement completes.

- Lifts implement perpetual, normal/fast down-wait-up and one-shot flat-changing
  raises. Ceiling movers implement lowering, highest-neighbor raising and normal,
  fast or silent crushers, including slowdown/recovery under an obstruction.
  Tag-based stop/resume retains direction, wait and speed. Active movers have no
  fixed thirty-object limit. Obstructed zero-wait platforms have an initialized
  lower endpoint and can retry after returning to it; they cannot stall forever
  by decrementing an already-zero wait count.

Fuzz effects, the full simulation loop, actor actions, HUD,
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
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/floor.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/floor-links.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/movers.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/teleport.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/teleport-map.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/switch.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/light.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/light-map.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/hazard.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/special-use.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/special-dispatch.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/think-order.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/think.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/think-map.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/clock-order.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/clock.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/enemy-decisions.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/noise.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/enemy.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/chase-decisions.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/walk-decisions.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/chase.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/projectile-decisions.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/projectile.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/combat-decisions.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/combat.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/effect-decisions.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/effect.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/fat-decisions.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/fat.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/pain-decisions.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/pain.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/place.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/tracer-decisions.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/tracer.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/position.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/vile-decisions.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/vile.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/fire-decisions.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/fire.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/boss-decisions.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/boss.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/ending-decisions.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/ending.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/awake.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/awake-real.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm node tools/toom/anim.test.mjs
HOLYC_WASM=/path/to/HolyC-wasm OUT=/tmp/toom-surfaces.json node tools/toom/surface-draw.test.mjs
BACKEND=hemu TEMPLEOS_WEB=/path/to/TempleOS-Web REFERENCE=/tmp/toom-surfaces.json node tools/toom/surface-draw.test.mjs
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
older pack formats. Player tics advance power durations; their HUD and audio
presentation remain unfinished.
The impact check covers 18 effect/projectile cases, including all three player
missiles, source immunity, auto-aim, close-wall explosions, nested line actions,
stale targets and repeated exception cleanup. Intentional test exceptions skip
Adam logging so the heap assertion measures the owned trigger buffer.
Actor-targeted missiles have their own native entry point: spawn and sound
precede shadow RNG, and vertical aim uses integer travel time. It shares the
atomic initial half-step with player projectiles. Original `P_SpawnMissile`
supplies 17,920 decision cases across eight projectile types; 137 assembled
cases check real half-steps, timers, NOBLOCKMAP behavior, sound order, owner/type
guards and callback-failure cleanup. Native and pinned HEMU evidence is in
`tools/toom/projectile-evidence.json`. The existing impact gate still passes;
actor attack actions and their complete dispatcher remain unfinished.
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
spawn/removal and exception cleanup. The floor fixture checks 768 preset/height
combinations over 107,940 individual tics, flat-change timing, sound cadence,
negative/isolated neighbors, texture metadata/defaults, busy tagged sectors,
actual crushing and blocked-floor recovery. Another 607 linked-floor checks
cover both stair speeds, fractional heights, busy branches, flat/direction
barriers, cycles, tagged-root coverage and donut motion/flat changes in either
boundary orientation. These are controlled topology fixtures, not a claim that
complete map progression has been exercised. Lift/ceiling fixtures add 7,300
individually checked tics across all eleven presets, exact sound/timing states,
stop/resume, real crush/slowdown recovery, zero-wait obstruction recovery and
negative/isolated ceiling heights. A 64-controller fixture verifies simultaneous
ownership, stop/resume, movement and cleanup beyond the legacy thirty-object
limits. Teleport fixtures exercise 544 occupancy, effect, ordering, nested-query,
retirement and exception-cleanup cases. A separate real-map fixture compares
456 transport lines in all 36 maps against independently decoded WAD records,
including two medium-skill lines without a destination. These call
the transport API directly; activation is checked separately below.
Switch/button checks add 154 state/ownership cases and 240
real-asset field changes/resets across all forty pairs. They cover repeat
presses, pair-before-field priority, forty concurrent buttons, callback append
and exception cleanup, with no image decoding or additional asset reads.
Lighting fixtures compare 51,200 individual tics over 200 brightness/neighbor/
cycle combinations, including external brightness changes during a cycle,
plus nine tag/ownership/order contracts. A separate WAD planner checks light
initialization of 626 lights and retained specials in all 14,556 sectors
across 36 maps.
Sector-effect fixtures compare 49,152 tics across 384 combinations of
sector type, protection, ground contact, skill and random seed, plus seven
map-floor/invulnerability/non-player/retirement contracts.
Line-event fixtures add 62 real-controller cases for use occlusion, keys,
failed/busy actions, permissions, teleport crossings, switches, lights and exit
requests. A separate oracle extracts action calls, enum arguments, order and
one-shot rules directly from hash-pinned original C, then checks 65,232 native
dispatch combinations and 9,222 action calls. It varies every special from
0 through 150, event kind, player role, actor type, side, secrecy and action
success. These establish activation wiring.
The thinker-order oracle compiles the four original C list routines in an
isolated host test, then compares 324 mixed creation/append/retirement scenarios
and 2,628 action calls with the native implementation. Its test allocator
retains retired records until the case ends; this isolates call order from the
original routine's read after its free callback. Eighteen real-controller cases
cover interleaved RNG, floor/actor order, callback spawns, retirement, exception
cleanup, reentry/destruction guards and timed-door/light initialization order.
All 36 real maps retain 626 light controllers and 183 secret sectors in their
expected order. The clock-order oracle separately compiles original `P_Ticker`
and compares 256 pause/resume cases with the native phase sequence. Twenty real
cases cover first-tic doors/buttons, the shared player/weapon clock, queued exits,
context and clock bounds, callback reentry/destruction, exception cleanup and
allocation/read stability. The player gate includes the complete program to
catch composition problems such as conflicting height constants. These remain
simulation foundations; actor AI/actions, host scheduling and level progression
are unfinished.
Clock evidence is recorded in `tools/toom/clock-evidence.json`. Its HEMU
exception/heap fixture uses the normal fresh-task launch path, matching the
native oracle: TempleOS logs exceptions to Adam, whose document allocations
must not be counted as allocations retained by the tested program.
The perception oracle compiles five original `p_enemy.c` functions and compares
30,632 native decisions, including target/flag/angle changes, sound and state
calls, sight/angle query counts and exact RNG positions. A separate oracle uses
the original recursive hearing functions for 3,178 graphs and 6,356 alerts;
cycles, closed/equal-height openings, sound barriers, improved routes, retained
targets and graphs up to 130 sectors are covered. Twenty-one assembled-module
cases exercise actual sight, doors, facing, state callbacks, stale/reused actor
handles and cleanup. All pass native TempleOS and the pinned HEMU engine in
`tools/toom/enemy-evidence.json`. Neither these fixtures nor the perception API
constitute a completed monster AI or gameplay qualification.
The chase oracle compares 29,182 scenarios with original `P_TryWalk`,
`P_NewChaseDir` and `A_Chase`, including complete movement/sound/state query
traces. The movement oracle compares 13,824 original `P_Move` cases plus two
nested-query/exception ownership cases. Twenty real-map cases cover walls,
floating height, door restrictions, crossing callbacks, attack-state entry and
cleanup. Their native and pinned HEMU results are in
`tools/toom/chase-evidence.json`. The shared fast flag currently affects chase
selection only; fast state durations and projectile speeds still need their
level setup. None of these fixtures install an incomplete action dispatcher.
The ordinary-combat oracle compares 18,304 cases against thirteen original
actions, retaining all ordered angle, sight, sound, aim, shot, damage, missile
and state observations with their RNG positions. Twenty-four real-map cases
exercise effects, damage, projectiles, refire, enemy and player shootable-door
triggers, nested queries and callback-failure cleanup. Their native and pinned
HEMU results are in `tools/toom/combat-evidence.json`. The full actor action
dispatcher and playable host remain unfinished.
The effect oracle compares 6,266 cases with nine original death, pain, fall,
footstep and explosion actions. Nineteen assembled cases add real movement,
death/pain state chains, episode-specific player sounds, owner/active guards
and callback-failure cleanup. The 279-case blast fixture now exercises explosion
and BFG action entry points, including blocked sight, boss immunity, missing
firers, all forty rays and callback failure. Native and pinned HEMU results
are in `tools/toom/effect-evidence.json`; the full dispatcher remains unfinished.
Mancubus spread and lost-soul charge match 2,334 original-C cases, including
all random starts, angle wrap and full event traces. Ninety actual two-missile
cases verify that initial positions precede spread changes, and twelve more
cover guards, callback failure, ownership and charge motion. Native and pinned
HEMU evidence is recorded in `tools/toom/fat-evidence.json`.
Pain-elemental spawning matches 3,468 original-C cases for population limits,
dying/retired actors, placement, damage and ordered charge events. Sixteen real
cases add actual collision/death handling, generation reuse, targetless spawns,
shadow RNG and callback-failure cleanup. Native and pinned HEMU results are in
`tools/toom/pain-evidence.json`.
Tracer homing matches 2,828 original-C cases with controlled puff/angle queries.
Its 110 real launch/trail/clock cases and 165 forced-placement cases pass native
and pinned HEMU; exact scopes are in `tools/toom/tracer-evidence.json`. Forced
placement refreshes spatial metadata immediately. Tracer puffs explicitly use
the normal animation, avoiding the original shared punch-range artifact. These
are stated native design choices, not a demo-synchronization claim.
Raw position queries and ordinary movement acceptance match 5,400 original-C
cases on native TempleOS and pinned HEMU. The optional raw query gathers actor
and line bounds without adding movement-only height, step and dropoff rules.
Default collision, contact and movement regressions remain green; exact scopes
are in `tools/toom/position-evidence.json`.
Arch-vile resurrection matches 8,160 original-C decision cases across every
canonical actor definition. Twenty-five actual geometry/lifecycle cases pass
native TempleOS and pinned HEMU, including competing corpses, blocked queries,
crushed bodies, shadow RNG and temporary-height restoration on exceptions.
Exact hashes and controlled oracle boundaries are in `tools/toom/vile-evidence.json`.
Arch-vile fire and attack match 6,144 original-C cases with controlled sight,
damage and spawn boundaries. Thirty-six actual geometry/damage/lifecycle cases
pass native TempleOS and pinned HEMU. The spawn boundary explicitly corrects
the original repeated-x coordinate typo; an occluded real-spawn case verifies
target x/y. Follow and blast moves refresh spatial ownership. Exact hashes,
callback failure setup and limitations are in `tools/toom/fire-evidence.json`.
Boss/Keen death decisions match 15,340 original-C cases. Thirty-two native and
pinned HEMU integration cases run the selected controllers to completion,
check level exits and preserve every linedef. The existing 14,873 door cases
and 768 floor cases (107,940 tics) also pass both backends. Exact scope and
source hashes are in `tools/toom/boss-evidence.json`; brain and complete host
actions remain unfinished.
Brain ending effects match 1,024 original-C cases covering all random starts
and every emitted actor's position, velocity, state/frame and timer. Nine
native and pinned HEMU lifecycle cases include 80 actual thinker tics and
exception cleanup. Exact controlled boundaries and hashes are recorded in
`tools/toom/ending-evidence.json`.
Target collection matches 864 original-C cases within the original 32-target
limit. Thirteen actual native and pinned HEMU cases add populations through
257, actor-slot growth, repeated refresh, stale handles and exception cleanup.
The larger table is an explicit native extension, recorded with exact scopes
in `tools/toom/awake-evidence.json`. Spawn cubes remain unfinished.
Surface fixtures compare 163,215 frame mappings against the original C cycle
definitions, then check all 327 scrolling lines and 128,180 sidedefs across
36 maps. Synthetic cases cover shared sidedefs, signed offset wrap, activation
changes, missing cycle endpoints and more than 64 scrolling lines. A separate
432-view fixture compares animated pixels and depth with an independent view
whose map names are replaced by the expected frames. It also checks changed
floor/ceiling names, sky transitions, invalid names and context ownership.
The single-player tic drives these updates independently of rendering.
Set `BACKEND=hemu TEMPLEOS_WEB=/path/to/TempleOS-Web` to run path, math, sliding,
motion, attack, damage, inventory, impact, weapon, player, blast, sight, sector,
door, floor, mover, teleport, switch, lighting, sector-effect, line-event, thinker
or surface/clock
checks using the original TempleOS compiler and file I/O under HEMU.
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

Omit `ALL=1` for E1M1, set `MAP=E2M3`, or select several maps with
`MAPS=E1M1,E4M7`. The default 30 repeats per view is
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

Surface integration is recorded in `tools/toom/surface-evidence.json`. All 432
animated pixel hashes agree between native TempleOS and the fixed HEMU build;
each backend also compares pixels and depth with explicit expected-frame map
names. Two matched timing pairs on E1M1 and the 983-sector E4M7 show no measured
cost from refreshing changed flat names. Those static-scene runs use no active
surface context, and do not establish animation or complete-game performance.
