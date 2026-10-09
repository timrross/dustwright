# Java test worlds (M9)

Two local Java servers for proving the Java profile in game. Nothing here touches any other world.

| Container               | Server                                       | Used for                                                       |
| ----------------------- | -------------------------------------------- | -------------------------------------------------------------- |
| `dustwright-test-java`  | Fabric 26.3, Fabric API only (vanilla logic) | Orientation probes, support faces, timings, every pattern      |
| `dustwright-test-paper` | Paper 26.3 with WorldEdit                    | Loading and saving Sponge `.schem` files from the console only |

Both are flat, creative, peaceful, never paused when empty (`pause-when-empty-seconds=0`), with the 80 × 64 check
area at the origin force-loaded by the scripts. Commands go over RCON inside each container (`rcon-cli`); the
answer comes back directly, so no log scraping. RCON is never published; the Fabric game port is published on
localhost (25566) only, for an optional look with a client.

```sh
docker compose up -d                                  # from this directory
pnpm build                                            # the scripts import the built packages
node measure-supports.mjs > supports-java.json        # which faces hold which components (registry faces.java)
node measure-timing.mjs > timing-java.json            # delays with the game frozen and stepped tick by tick
node ingame-check.mjs [--only probes|patterns]        # orientation probes and every pattern as a Java design
node schem-roundtrip.mjs [design.rsd.json]            # .schem into the Paper world and back (default: the M3
                                                      # orientation test)
```

Why two servers: WorldEdit on Fabric gives the console no world to act in (`//world` accepts no name there, and
commands run through a fake player did nothing), while WorldEdit on Paper takes `//world world` from the console.
Paper changes some game behaviour, so it is used only to load and save files, with WorldEdit's neighbour and block
updates off, never to judge a circuit.

Java facts the scripts rely on, each measured here rather than remembered:

- `/setblock` updates neighbours, so dust works its shape out as it is placed; but a powered lever or button set
  by `/setblock` does not update the neighbours of the block it hangs on (as on Bedrock), so the check swaps that
  block for another conducting block and back.
- A component is re-checked for support only when the update comes from its support's side, so supports are
  measured by placing the component first and its support second.
