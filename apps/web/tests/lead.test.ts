import assert from "node:assert/strict";
import { test } from "node:test";
import type { FeedItemSummary } from "@aihot/contracts/site";
import { sameEvent, splitLead } from "../app/features/feed/lead.ts";

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

test("lead, grid and top stories hold only featured news, strongest first, split 1 + 4 + 5", () => {
  const featured = Array.from({ length: 12 }, (_, i) => item({ score: 10 + i, daysAgo: i % 3 }));
  const plain = [item({ selected: false, score: 99 }), item({ selected: false, score: 98 })];
  const all = [...plain, ...featured];
  const { lead, grid, top, rest } = splitLead(all);
  const ranked = [...featured].sort((a, b) => b.score! - a.score!);
  assert.equal(lead?.id, ranked[0]!.id);
  assert.deepEqual(ids(grid), ids(ranked.slice(1, 5)));
  assert.deepEqual(ids(top), ids(ranked.slice(5, 10)));
  assert.ok([lead!, ...grid, ...top].every((x) => x.selected));
  // The two weakest featured stories and the unfeatured ones keep the list, in the original order.
  assert.deepEqual(ids(rest), ids(all.filter((x) => !ranked.slice(0, 10).includes(x))));
});

test("latest is the ten newest news stories of any status and may repeat a featured story", () => {
  const featured = Array.from({ length: 6 }, (_, i) => item({ score: 90 - i, daysAgo: 2 + i }));
  const plain = Array.from({ length: 8 }, (_, i) => item({ selected: false, score: 1, daysAgo: i * 0.1 }));
  const x = item({ channel: "x", daysAgo: 0 });
  const { latest, lead } = splitLead([...featured, x, ...plain]);
  assert.equal(latest.length, 10);
  assert.ok(!latest.includes(x));
  assert.deepEqual(ids(latest.slice(0, 8)), ids([...plain].sort((a, b) => Date.parse(b.timelineAt) - Date.parse(a.timelineAt))));
  assert.ok(latest.includes(featured[0]!) && latest[8] === featured[0]);
  assert.equal(lead, featured[0]);
});

test("only the newest 7-day window competes when it has enough stories", () => {
  const old = item({ score: 100, daysAgo: 20 });
  const fresh = Array.from({ length: 6 }, (_, i) => item({ score: 10 + i, daysAgo: i }));
  const { lead, grid, top } = splitLead([...fresh, old]);
  assert.ok(![lead!, ...grid, ...top].includes(old));
});

test("window extends backwards when fewer than 5 featured stories are recent", () => {
  const fresh = [item({ score: 5, daysAgo: 0 }), item({ score: 6, daysAgo: 1 })];
  const olderA = item({ score: 90, daysAgo: 10 });
  const olderB = item({ score: 80, daysAgo: 12 });
  const olderC = item({ score: 99, daysAgo: 40 });
  const { lead, grid, top } = splitLead([...fresh, olderA, olderB, olderC]);
  assert.equal(lead, olderC);
  assert.deepEqual(ids(grid), ids([olderA, olderB, fresh[1]!, fresh[0]!]));
  assert.equal(top.length, 0);
});

test("sections shrink when there are few featured stories", () => {
  const few = [item({ score: 3 }), item({ score: 9 })];
  const out = splitLead(few);
  assert.equal(out.lead, few[1]);
  assert.deepEqual(ids(out.grid), ids([few[0]!]));
  assert.deepEqual(out.top, []);
  assert.deepEqual(out.rest, []);
});

test("x posts and unfeatured items are never promoted; no featured items means no lead", () => {
  const x = item({ channel: "x", score: 100 });
  const plain = item({ selected: false });
  const out = splitLead([x, plain]);
  assert.equal(out.lead, null);
  assert.deepEqual([out.grid, out.top], [[], []]);
  assert.deepEqual(ids(out.latest), ids([plain]));
  assert.deepEqual(ids(out.rest), ids([x, plain]));
});

const SIGNS = "6K Additive signs US$8.1M–US$10.8M Nickel 718 supply and powder buy-back agreement with ADDMAN";
const AGREE = "6K Additive and ADDMAN agree 30-month Nickel 718 powder supply contract worth up to $10.8m";

test("the same event from two publishers is recognised; unrelated stories are not", () => {
  assert.ok(sameEvent(SIGNS, AGREE));
  assert.ok(!sameEvent(SIGNS, "Xometry outlook shows US manufacturing backlogs growing alongside unused capacity at smaller factories"));
  assert.ok(!sameEvent("Stratasys Announces Planned Rollout of Additive Manufacturing Solutions Across 20+ GM Facilities", "Stratasys Announced IMTS 2026 Showcase of Additive Manufacturing Solutions It Describes as Production-Proven"));
  assert.ok(!sameEvent("Prusa launches Prusament PLA ColorMix filaments for 45 shades from five spools", "Prusa launches Prusament PLA Lightweight with claimed weight reduction of up to 65% versus regular PLA"));
});

test("a second report of an event already picked is skipped for lead, grid and top, and stays in the list", () => {
  const first = item({ title: SIGNS, score: 90 });
  const second = item({ title: AGREE, score: 80 });
  const others = Array.from({ length: 3 }, (_, i) => item({ title: `Unrelated headline number ${"abc"[i]} about different topics`, score: 70 - i }));
  const { lead, grid, top, rest } = splitLead([first, second, ...others]);
  assert.equal(lead, first);
  assert.ok(![...grid, ...top].includes(second));
  assert.ok(rest.includes(second));
});
