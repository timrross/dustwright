// The M8 authoring eval: each fixed prompt goes to a fresh Claude Code agent (`claude -p`) that has only
// AUTHORING.md and the CLI (`rsd`, through Bash) in an empty working directory, or (with --mcp) only the MCP tools of
// `rsd mcp`. The harness then validates the agent's final design itself and logs the result per prompt.
//   node scripts/eval/run.mjs [--mcp] [--only id,id] [--out docs/eval/<dir>]
// Target (spec M8): at least 8 of 10 reach zero errors and passing tests within 6 validate rounds.
import { execFileSync, spawn } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const args = process.argv.slice(2);
const viaMcp = args.includes("--mcp");
const only = args.includes("--only") ? args[args.indexOf("--only") + 1].split(",") : null;
// --rescore: score the transcripts already in --out again, without running agents.
const rescore = args.includes("--rescore");
const outDir = args.includes("--out")
  ? args[args.indexOf("--out") + 1]
  : join(root, "docs/eval", `${new Date().toISOString().slice(0, 10)}-${viaMcp ? "mcp" : "cli"}`);
const prompts = JSON.parse(readFileSync(join(root, "scripts/eval/prompts.json"), "utf8")).filter(
  (p) => !only || only.includes(p.id),
);
const bin = join(root, "packages/cli/dist/bin.js");
mkdirSync(outDir, { recursive: true });

const CLI_TASK = (prompt) => `Design this Minecraft Bedrock redstone circuit: ${prompt}.

Read AUTHORING.md in this directory first; it is the only documentation. Write the design to design.rsd.json in this
directory, with ports and tests for the job. Check it with \`rsd validate design.rsd.json --json\` and fix what the
diagnostics say. Use at most 6 validate rounds. Never change ports or tests to make a failure go away. When done,
reply with one line: DONE or GAVE UP, and why.`;

const MCP_TASK = (prompt) => `Design this Minecraft Bedrock redstone circuit: ${prompt}.

Use the dustwright tools. Make the design pass validate with zero errors and passing tests, in at most 6 validate
rounds. When done, reply with one line: DONE or GAVE UP, and why.`;

function runAgent(cwd, task, extra) {
  return new Promise((resolve) => {
    const child = spawn(
      "claude",
      [
        "-p",
        task,
        "--output-format",
        "stream-json",
        "--verbose",
        "--no-session-persistence",
        "--setting-sources",
        "",
        "--strict-mcp-config",
        "--permission-mode",
        "dontAsk",
        ...extra,
      ],
      {
        cwd,
        env: { ...process.env, PATH: `${join(cwd, ".bin")}:${process.env.PATH}` },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    const timer = setTimeout(() => child.kill("SIGTERM"), 15 * 60_000);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, out, err });
    });
  });
}

/** The tool calls in a stream-json transcript, with their results. */
function toolCalls(stream) {
  const calls = [];
  const byId = new Map();
  for (const line of stream.split("\n")) {
    let ev;
    try {
      ev = JSON.parse(line);
    } catch {
      continue;
    }
    for (const c of ev.message?.content ?? []) {
      if (c.type === "tool_use") {
        const call = { name: c.name, input: c.input, result: null };
        calls.push(call);
        byId.set(c.id, call);
      } else if (c.type === "tool_result" && byId.has(c.tool_use_id)) {
        const r = c.content;
        byId.get(c.tool_use_id).result = Array.isArray(r)
          ? r.map((x) => x.text ?? "").join("")
          : String(r ?? "");
      }
    }
  }
  return calls;
}

const finalLine = (stream) => {
  for (const line of stream.split("\n").reverse()) {
    try {
      const ev = JSON.parse(line);
      if (ev.type === "result")
        return String(ev.result ?? "")
          .trim()
          .split("\n")
          .pop();
    } catch {
      /* skip */
    }
  }
  return "";
};

/** Scores one run from its transcript and the design it left, re-validated by the harness. */
function score(id, prompt, stream, cliDesign, seconds, exit) {
  const calls = toolCalls(stream);
  const isValidate = (c) =>
    viaMcp
      ? c.name === "mcp__dustwright__validate"
      : c.name === "Bash" && /\brsd\s+validate\b/.test(c.input?.command ?? "");
  const isCheck = (c) => isValidate(c) || c.name === "mcp__dustwright__simulate";
  const validates = calls.filter(isValidate);
  // The design: the file in CLI mode; in MCP mode, the last design the agent validated.
  const design = viaMcp ? (validates.at(-1)?.input?.design ?? null) : cliDesign;
  let verdict = { ok: false, diagnostics: [] };
  if (design !== null) {
    writeFileSync(join(outDir, `${id}.rsd.json`), design);
    try {
      verdict = JSON.parse(
        execFileSync(process.execPath, [bin, "validate", join(outDir, `${id}.rsd.json`), "--json"], {
          encoding: "utf8",
        }),
      );
    } catch (e) {
      verdict = JSON.parse(e.stdout);
    }
  }
  const tests = (() => {
    try {
      return JSON.parse(design ?? "{}").tests?.length ?? 0;
    } catch {
      return 0;
    }
  })();
  const errors = verdict.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
  // A round is one check (validate, or simulate through MCP); count them up to the first clean validate.
  const checks = calls.filter(isCheck);
  const firstClean = checks.findIndex((c) => isValidate(c) && /"ok":\s*true/.test(c.result ?? ""));
  const roundsToClean = firstClean < 0 ? null : firstClean + 1;
  const pass =
    design !== null &&
    verdict.ok &&
    errors.length === 0 &&
    tests > 0 &&
    roundsToClean !== null &&
    roundsToClean <= 6;
  return {
    id,
    prompt,
    pass,
    roundsToClean,
    checkCalls: checks.length,
    validateCalls: validates.length,
    tests,
    errors,
    warnings: verdict.diagnostics.filter((d) => d.severity === "warning").map((d) => d.code),
    skipped: verdict.diagnostics.filter((d) => d.code === "T003").length,
    tools: calls.map((c) => c.name.replace("mcp__dustwright__", "")),
    patternsUsed: calls.filter((c) => c.name === "mcp__dustwright__get_pattern").map((c) => c.input?.slug),
    finalLine: finalLine(stream),
    seconds,
    exit,
  };
}

const results = [];
for (const { id, prompt } of prompts) {
  const cwd = mkdtempSync(join(tmpdir(), `dw-eval-${id}-`));
  mkdirSync(join(cwd, ".bin"));
  let extra;
  if (viaMcp) {
    const config = { mcpServers: { dustwright: { command: process.execPath, args: [bin, "mcp"] } } };
    writeFileSync(join(cwd, ".mcp-config.json"), JSON.stringify(config));
    extra = [
      "--mcp-config",
      join(cwd, ".mcp-config.json"),
      "--tools",
      "",
      "--allowedTools",
      "mcp__dustwright",
    ];
  } else {
    copyFileSync(join(root, "AUTHORING.md"), join(cwd, "AUTHORING.md"));
    // The CLI agent gets the CLI alone: `rsd mcp` would hand it the pattern library, so the wrapper refuses it
    // (the 2026-10-09 run predates this; one agent tried it, and the attempt failed).
    writeFileSync(
      join(cwd, ".bin/rsd"),
      `#!/bin/sh\nfor a in "$@"; do [ "$a" = mcp ] && { echo "rsd mcp is not part of this eval" >&2; exit 2; }; done\nexec "${process.execPath}" "${bin}" "$@"\n`,
    );
    chmodSync(join(cwd, ".bin/rsd"), 0o755);
    extra = [
      "--tools",
      "Bash,Read,Write,Edit",
      "--allowedTools",
      "Bash(rsd:*)",
      "Read(./**)",
      "Write(./**)",
      "Edit(./**)",
      "--disallowedTools",
      "Bash(rsd mcp:*)",
    ];
  }
  const started = Date.now();
  let stream;
  let exit = null;
  if (rescore) {
    stream = readFileSync(join(outDir, `${id}.transcript.jsonl`), "utf8");
  } else {
    console.error(`${id}: running`);
    const run = await runAgent(cwd, viaMcp ? MCP_TASK(prompt) : CLI_TASK(prompt), extra);
    stream = run.out;
    exit = run.code;
    writeFileSync(join(outDir, `${id}.transcript.jsonl`), stream);
  }
  const cliDesign = rescore
    ? existsSync(join(outDir, `${id}.rsd.json`))
      ? readFileSync(join(outDir, `${id}.rsd.json`), "utf8")
      : null
    : existsSync(join(cwd, "design.rsd.json"))
      ? readFileSync(join(cwd, "design.rsd.json"), "utf8")
      : null;
  const result = score(
    id,
    prompt,
    stream,
    viaMcp ? null : cliDesign,
    Math.round((Date.now() - started) / 1000),
    exit,
  );
  results.push(result);
  console.error(
    `${id}: ${result.pass ? "PASS" : "FAIL"} rounds ${result.roundsToClean ?? "-"}/${result.checkCalls}, tests ${result.tests}, errors ${result.errors.join(",") || "none"}`,
  );
}
const passed = results.filter((r) => r.pass).length;
writeFileSync(
  join(outDir, "results.json"),
  `${JSON.stringify({ when: new Date().toISOString(), mode: viaMcp ? "mcp" : "cli", passed, total: results.length, results }, null, 2)}\n`,
);
console.log(`${passed} of ${results.length} passed (${viaMcp ? "MCP" : "CLI"}); results in ${outDir}`);
