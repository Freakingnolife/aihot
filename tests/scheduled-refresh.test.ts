// The refresh runner's clock: 07:00 and 19:00 Singapore time (UTC+8, no daylight saving), nothing else.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { nextSlot } from "../scripts/scheduled-refresh.ts";

const at = (iso: string) => Date.parse(iso);
const next = (iso: string) => new Date(nextSlot(at(iso))).toISOString();

test("the next slot is 07:00 or 19:00 Singapore time, whichever comes first", () => {
  assert.equal(next("2026-10-03T10:00:00+08:00"), "2026-10-03T11:00:00.000Z"); // 19:00 SGT today
  assert.equal(next("2026-10-03T20:00:00+08:00"), "2026-10-03T23:00:00.000Z"); // 07:00 SGT tomorrow
  assert.equal(next("2026-10-03T02:00:00+08:00"), "2026-10-02T23:00:00.000Z"); // 07:00 SGT today
});

test("a slot that has just started is not repeated; the day and year roll over", () => {
  assert.equal(next("2026-10-03T07:00:00+08:00"), "2026-10-03T11:00:00.000Z");
  assert.equal(next("2026-10-03T06:59:59.999+08:00"), "2026-10-02T23:00:00.000Z");
  assert.equal(next("2026-12-31T19:00:00+08:00"), "2026-12-31T23:00:00.000Z");
  assert.equal(next("2026-12-31T23:30:00+08:00"), "2026-12-31T23:00:00.000Z"); // 07:00 SGT on 1 Jan
});

test("with collection and model calls disabled, a one-shot refresh exits without starting work", () => {
  const run = spawnSync(process.execPath, ["scripts/scheduled-refresh.ts", "--once"], {
    encoding: "utf8",
    env: { ...process.env, COLLECT_ENABLED: "false", MODEL_CALLS_ENABLED: "false" },
  });
  assert.equal(run.status, 0, run.stderr);
  const lines = run.stdout.trim().split("\n");
  assert.equal(lines.length, 1);
  const summary = JSON.parse(lines[0]!) as { status: string; grouping?: unknown };
  assert.equal(summary.status, "disabled");
  assert.equal(summary.grouping, undefined, "the disabled refresh does not start the grouping queue");
});
