import type { Edition, SimMechanics } from "@dustwright/core";

/**
 * Bedrock redstone mechanics: no quasi-connectivity, push limit 12 (per the architecture spec). Delays are in game
 * ticks (a redstone tick is 2).
 *
 * Measured in game (`deploy/test-world/measure-timing.mjs`, `docs/ingame/2026-10-08-m6-timing.json`): an observer
 * reacts 3 game ticks after the block it watches changes and pulses for 2, so two observers facing each other
 * clock with a period of 6 game ticks (3 redstone ticks). VERIFY-IN-GAME: the other delays (torch, repeater step,
 * comparator, piston, lamps and doors: 2 game ticks each) are one redstone tick by assumption; the T flip-flop's
 * measured latency (7 to 10 game ticks, against 8 here) is consistent with them but does not prove each one.
 * VERIFY-IN-GAME: button pulse lengths (registry `button` `sim.params.pulseTicks`: stone 10, wood 15 redstone ticks)
 * are assumed. They cannot be measured from the console: a button set pressed by /setblock never releases itself
 * (measured, M8), so the in-game check releases it after the registry's length and only checks what follows.
 */
export const BEDROCK_MECHANICS: SimMechanics = {
  id: "bedrock",
  quasiConnectivity: false,
  pushLimit: 12,
  timing: { torch: 2, repeater: 2, comparator: 2, observer: 3, observerPulse: 2, piston: 2, consumer: 2 },
};

/**
 * Java redstone mechanics (M9): quasi-connectivity (a piston also counts power at the block above it), push limit
 * 12. Delays in game ticks, measured on 26.3 with the game frozen and stepped one tick at a time
 * (`deploy/test-world-java/measure-timing.mjs`, `docs/ingame/2026-10-09-java-timing.json`, five runs each, all
 * equal): torch 2, repeater 2 per delay step, comparator 2, observer 2 with a 2-tick pulse, piston 3 until its head
 * stands, doors and trapdoors 0, lamps 0 to light and 4 to go dark. VERIFY-IN-GAME: the push limit and the
 * quasi-connectivity rule (the game waits for a block update; this does not).
 */
export const JAVA_MECHANICS: SimMechanics = {
  id: "java",
  quasiConnectivity: true,
  pushLimit: 12,
  timing: {
    torch: 2,
    repeater: 2,
    comparator: 2,
    observer: 2,
    observerPulse: 2,
    piston: 3,
    consumer: 0,
    lampOff: 4,
  },
};

/** The mechanics of each edition: what the edition profiles and the viewer's power view simulate with. */
export const MECHANICS: Readonly<Record<Edition, SimMechanics>> = {
  bedrock: BEDROCK_MECHANICS,
  java: JAVA_MECHANICS,
};
