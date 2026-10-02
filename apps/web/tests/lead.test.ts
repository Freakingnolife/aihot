import assert from "node:assert/strict";
import { test } from "node:test";
import type { FeedItemSummary } from "@aihot/contracts/site";
import { splitLead } from "../app/features/feed/lead.ts";

const NOW = Date.parse("2026-10-03T00:00:00Z");
let n = 0;
function item(over: Partial<FeedItemSummary> & { daysAgo?: number } = {}): FeedItemSummary {
  const { daysAgo = 0, ...rest } = over;
  n += 1;
  const at = new Date(NOW - daysAgo * 86400000 - n * 1000).toISOString();
  return {
    id: `i${n}`, title: `T${n}`, summary: null, reason: null, publishedAt: at, timelineAt: at, category: null, tags: [],
    score: 50, selected: true, channel: "news", source: { name: "S" }, cover: null, x: null, ...rest,
  };
}
const ids = (xs: FeedItemSummary[]) => xs.map((x) => x.id);

test("lead and overview hold only featured news, strongest first, split 4 + 5", () => {
  const featured = Array.from({ length: 11 }, (_, i) => item({ score: 10 + i, daysAgo: i % 3 }));
  const plain = [item({ selected: false, score: 99 }), item({ selected: false, score: 98 })];
  const { lead, overview, rest } = splitLead([...plain, ...featured]);
  const ranked = [...featured].sort((a, b) => b.score! - a.score!);
  assert.deepEqual(ids(lead), ids(ranked.slice(0, 4)));
  assert.deepEqual(ids(overview), ids(ranked.slice(4, 9)));
  assert.ok(lead.every((x) => x.selected) && overview.every((x) => x.selected));
  assert.deepEqual(ids(rest), ids([...plain, ...ranked.slice(9)].sort((a, b) => ids([...plain, ...featured]).indexOf(a.id) - ids([...plain, ...featured]).indexOf(b.id))));
});

test("only the newest 7-day window competes when it has enough stories", () => {
  const old = item({ score: 100, daysAgo: 20 });
  const fresh = Array.from({ length: 5 }, (_, i) => item({ score: 10 + i, daysAgo: i }));
  const { lead, overview } = splitLead([...fresh, old]);
  assert.ok(![...lead, ...overview].includes(old));
});

test("window extends backwards when fewer than 4 featured stories are recent", () => {
  const fresh = [item({ score: 5, daysAgo: 0 }), item({ score: 6, daysAgo: 1 })];
  const olderA = item({ score: 90, daysAgo: 10 });
  const olderB = item({ score: 80, daysAgo: 12 });
  const olderC = item({ score: 99, daysAgo: 40 });
  const { lead, overview } = splitLead([...fresh, olderA, olderB, olderC]);
  assert.equal(lead.length, 4);
  assert.deepEqual(ids(lead), ids([olderA, olderB, fresh[1]!, fresh[0]!]));
  assert.equal(overview.length, 0);
});

test("x posts and unfeatured items are never promoted; no featured items means no lead", () => {
  const x = item({ channel: "x", score: 100 });
  const plain = item({ selected: false });
  const out = splitLead([x, plain]);
  assert.deepEqual([out.lead, out.overview], [[], []]);
  assert.deepEqual(ids(out.rest), ids([x, plain]));
});
