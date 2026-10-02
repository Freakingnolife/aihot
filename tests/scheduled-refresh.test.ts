// The refresh runner's clock: 07:00 and 19:00 Singapore time (UTC+8, no daylight saving), nothing else.
import assert from "node:assert/strict";
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
