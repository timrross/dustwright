# Dustwright test world

A separate Bedrock dedicated server for in-game verification: flat, creative, cheats on, on its own port
(19142/tcp), with `packs/redstone-designs-bp` mounted read-only. It never touches live worlds, and no other world
mounts the pack.

## Start it

```sh
cd deploy/test-world
docker compose up -d                 # first start creates the world
node enable-pack.mjs                 # writes worlds/dustwright-test/world_behavior_packs.json
docker compose restart
```

Connect from a Bedrock client to `<host>:19142`. Set `content-log-console-output-enabled=true` in
`data/server.properties` (if the image does not map `CONTENT_LOG_CONSOLE_OUTPUT_ENABLED`), so a rejected pack shows
`ERROR` lines in `docker compose logs`.

Notes from running other worlds on the same host:

- From 1.26.5x players connect only over NetherNet (TCP), so the compose file sets `TRANSPORT=nethernet` and
  publishes 19142/tcp; with RakNet the server starts but logs that players cannot connect. The image's
  `bds-healthcheck` probes NetherNet's `/v1/join` (verified: healthy, and `/v1/join` answers 200 from the host).
- Run each instance on the port it publishes (`SERVER_PORT` 19142, mapped 1:1), so nothing redirects clients to
  another server on the host.
- If the image cannot download the server (minecraft.net refuses its User-Agent), download
  `bedrock-server-<version>.zip` with a browser User-Agent into `data/`, then start with
  `BDS_VERSION=<version> BDS_DIRECT_DOWNLOAD_URL=file:///data/bedrock-server-<version>.zip docker compose up -d`.
- Pin `BDS_VERSION` to the registry's game version (`PINS.gameVersion`, 1.26.50) or the newest patch of it.

## Put designs in the pack

```sh
export RSD_PACK_DIR="$PWD/packs/redstone-designs-bp"
pnpm rsd export examples/not-gate.rsd.json --to mcfunction --clear
```

## Automated in-game check

Start the server cold (`docker compose stop` then `docker compose up -d`) before a run: after a warm restart a
server can accept commands while its chunks do not tick. The check verifies that the world ticks before it starts,
between sections and at the end, and exits 2 (the run is invalid) if it stops.

```sh
pnpm build
for f in examples/*.rsd.json; do pnpm rsd export "$f" --to mcfunction --clear; done
node deploy/test-world/ingame-check.mjs dustwright-test            # or --only probes|examples|orientation
```

Through the server console (no client needed) it probes what the VERIFY-IN-GAME mappings mean (torch, lever and
button supports; repeater and comparator input sides; lever on state; piston push directions), with negative
controls that the pre-review mappings must fail; builds every example with its own function and runs its
truth-table tests; checks that the T flip-flop toggles through a sequence, that clear-then-build twice equals one
build, that a build never removes a block around it, and that the orientation test builds with nothing dropped.
It works only inside an 80 × 64 area at the world origin, and prints a JSON summary last.

## Simulator timing cross-check

`measure-timing.mjs` measures in game, at game-tick resolution, what the simulator assumes about timing: the
observer clock's period and pulse width, a lone observer's delay and pulse, and the T flip-flop's toggles and
latency. It compares each with the simulator and exits 1 on a difference.

```sh
pnpm build
for f in examples/observer-clock.rsd.json examples/t-flip-flop.rsd.json; do pnpm rsd export "$f" --to mcfunction --clear; done
node deploy/test-world/measure-timing.mjs install <pack-dir>     # restart the server cold
node deploy/test-world/measure-timing.mjs run dustwright-test > timing.json
node deploy/test-world/measure-timing.mjs uninstall <pack-dir>   # restart the server cold again
```

The probe runs a function every game tick (`functions/tick.json`). Remove it straight after the run: while it is
installed, redstone stops ticking in parts of the world (seen on BDS 1.26.52.3), and `ingame-check.mjs` fails.

## Jeb door sync

`measure-door-sync.mjs` measures in game, at game-tick resolution, the tick at which each of the Jeb door's four
blocks leaves the outer wall on opening and returns on closing, with a pig held on each plate, and reports how far
apart they are (0 when the upper and lower rows move together). Extra slugs measure other versions of the door at
the same site, to compare.

```sh
pnpm build
pnpm rsd export examples/jeb-door.rsd.json --to mcfunction --clear
node deploy/test-world/measure-door-sync.mjs install <pack-dir>     # restart the server cold
node deploy/test-world/measure-door-sync.mjs run dustwright-test > sync.json
node deploy/test-world/measure-door-sync.mjs uninstall <pack-dir>   # restart the server cold again
```

Like the timing probe, it runs a function every game tick: remove it straight after the run.

## Structure round trip

Save a build with `/structure save <name> <from> <to> false disk true`, stop the server (the world database must
be closed, or copy it), extract it with `deploy/test-world/extract-structure.py` (needs `pip install
amulet-leveldb` in a virtualenv) and compare it with an export using `deploy/test-world/compare-structure.mjs`.
The same comparison re-measures `PINS.blockStateVersion` after a game update.

## Play

Restart the server so it finds new function files (`docker compose restart`; a reload only picks up edits to
existing ones). Then in game: stand where the build should start, and run `/function rsd/not-gate` (the build lands one
block east of you). `/function rsd/not-gate_clear` removes it again. The checklist for the M3 sign-off is in
`docs/verify-m3.md`.

## Script API loader (M10)

`pnpm rsd loader patterns/*.rsd.json -o rsd-loader.mcpack` makes one behavior pack with the loader script and those
designs. Install it like any pack (unzip it into `behavior_packs/` and list its header UUID in the world's
`world_behavior_packs.json`, or import the `.mcpack` on a client), restart, then `/scriptevent rsd:list`,
`/scriptevent rsd:build not-gate <x> <y> <z>` and `/scriptevent rsd:clear not-gate <x> <y> <z>`, from chat or the
console. `node deploy/test-world/ingame-check.mjs <container> --only patterns --via loader` builds every pattern
through it and runs their tests (`docs/ingame/2026-10-09-loader.json`).
