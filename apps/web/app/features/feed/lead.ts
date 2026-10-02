// Which stories open the Recent page: the strongest featured ones, never just the newest.
import type { FeedItemSummary } from "@aihot/contracts/site";

const GRID_COUNT = 4;
const TOP_COUNT = 5;
const LATEST_COUNT = 10;
const WINDOW_MS = 7 * 86400000;
// Headlines about one event from two publishers share most of their distinctive words. Real pairs in the pilot data
// score 0.63-0.78 on the overlap coefficient (shared words / words in the shorter headline); the closest unrelated pair
// scores 0.44. 0.55 sits between them, and at least 3 shared words keeps very short headlines from matching by chance.
const SAME_EVENT_OVERLAP = 0.55;
const SAME_EVENT_MIN_SHARED = 3;
const STOPWORDS = new Set(["with", "from", "that", "this", "have", "will", "into", "over", "after", "about", "their", "than", "more", "says", "said", "when", "which", "were", "been", "your", "amid"]);

const when = (it: FeedItemSummary) => Date.parse(it.publishedAt ?? it.timelineAt);
const strongest = (a: FeedItemSummary, b: FeedItemSummary) => (b.score ?? 0) - (a.score ?? 0) || when(b) - when(a);

const words = (title: string) => new Set(title.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 3 && !STOPWORDS.has(w)));

/** True when two headlines most likely report the same event (grouping does not run, so there is no shared story id). */
export function sameEvent(a: string, b: string): boolean {
  const x = words(a);
  const y = words(b);
  const shared = [...x].filter((w) => y.has(w)).length;
  return shared >= SAME_EVENT_MIN_SHARED && shared / Math.min(x.size, y.size) >= SAME_EVENT_OVERLAP;
}

/**
 * The front page's four groups and the rest of the list. Featured news from the newest 7 days competes on score
 * (the window reaches further back only to fill the lead and grid): the best one leads, the next four make the grid,
 * the next five the numbered "Top stories this week". "Latest" is simply the newest news of any status and may repeat
 * a featured story. A story whose headline reads like one already picked (see `sameEvent`) is skipped for these three, not hidden: it stays
 * in the chronological list, as does everything else not leading, in the grid or in the top stories.
 */
export function splitLead(items: FeedItemSummary[]): {
  lead: FeedItemSummary | null;
  grid: FeedItemSummary[];
  top: FeedItemSummary[];
  latest: FeedItemSummary[];
  rest: FeedItemSummary[];
} {
  const featured = items.filter((it) => it.channel === "news" && it.selected).sort((a, b) => when(b) - when(a));
  const newest = featured[0] ? when(featured[0]) : 0;
  const recent = featured.filter((it) => when(it) >= newest - WINDOW_MS);
  const ranked = (recent.length >= 1 + GRID_COUNT ? recent : featured.slice(0, 1 + GRID_COUNT)).sort(strongest);
  const picked: FeedItemSummary[] = [];
  for (const it of ranked) {
    if (picked.length === 1 + GRID_COUNT + TOP_COUNT) break;
    if (!picked.some((p) => sameEvent(p.title, it.title))) picked.push(it);
  }
  const lead = picked[0] ?? null;
  const grid = picked.slice(1, 1 + GRID_COUNT);
  const top = picked.slice(1 + GRID_COUNT);
  const latest = items.filter((it) => it.channel === "news").sort((a, b) => when(b) - when(a)).slice(0, LATEST_COUNT);
  const shown = new Set([...(lead ? [lead] : []), ...grid, ...top]);
  return { lead, grid, top, latest, rest: items.filter((it) => !shown.has(it)) };
}
