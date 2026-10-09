# Patterns on Java Edition

Every v1 pattern, built as a Java design (the same file with `"edition": "java"`) in the Java test world
(Fabric 26.3, vanilla logic) by `deploy/test-world-java/ingame-check.mjs --only patterns`. Each test case runs on a
fresh build; the RS latch and T flip-flop also run a set and hold sequence, the clocks must keep changing, the
hopper sorter sorts real items, and every wire's connections (our `.schem`/`.litematic` shapes) must equal the
shape the game gives it. Evidence: `docs/ingame/2026-10-09-java.json`.

| Pattern                                                 | Java checks | Differs from Bedrock?                                                                                                                                                                                   |
| ------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `2x2-piston-door` (`patterns/piston-door-2x2.rsd.json`) | 3 of 3 pass | No: same behaviour, same tests.                                                                                                                                                                         |
| `and-gate`                                              | 5 of 5 pass | No: same behaviour, same tests.                                                                                                                                                                         |
| `hopper-sorter`                                         | 3 of 3 pass | Its tests are T003 in the simulator on both editions; the in-game item check passes on Java as on Bedrock.                                                                                              |
| `not-gate`                                              | 3 of 3 pass | No: same behaviour, same tests.                                                                                                                                                                         |
| `observer-clock`                                        | 4 of 4 pass | Runs on Java too, faster: a Java observer reacts after 2 game ticks (measured; Bedrock 3), so its period should be 4 game ticks instead of 6 (inferred, not measured directly). Its tests hold on both. |
| `or-gate`                                               | 5 of 5 pass | No: same behaviour, same tests.                                                                                                                                                                         |
| `pulse-extender`                                        | 4 of 4 pass | No: same behaviour, same tests.                                                                                                                                                                         |
| `pulse-limiter`                                         | 4 of 4 pass | Its sticky piston is powered directly; quasi-connectivity changes nothing.                                                                                                                              |
| `repeater-clock`                                        | 4 of 4 pass | No: same loop (Java repeaters measured at 2 game ticks per delay step, the value Bedrock assumes).                                                                                                      |
| `repeater-line`                                         | 3 of 3 pass | No: same behaviour, same tests.                                                                                                                                                                         |
| `rs-latch`                                              | 4 of 4 pass | No: same behaviour, same tests.                                                                                                                                                                         |
| `t-flip-flop`                                           | 4 of 4 pass | Its pistons are powered directly; quasi-connectivity changes nothing.                                                                                                                                   |
| `xor-gate`                                              | 5 of 5 pass | No: same behaviour, same tests.                                                                                                                                                                         |

No pattern needed a Java-specific change. Quasi-connectivity would only matter for a piston powered from the block
above it; W105, the Bedrock rule that finds pistons only quasi-connectivity would fire, finds none in the patterns.
