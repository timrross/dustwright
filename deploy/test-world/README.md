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

## Play

Restart the server so it finds new function files (`docker compose restart`; a reload only picks up edits to
existing ones). Then in game: stand where the build should start, and run `/function rsd/not-gate` (the build lands one
block east of you). `/function rsd/not-gate_clear` removes it again. The checklist for the M3 sign-off is in
`docs/verify-m3.md`.
