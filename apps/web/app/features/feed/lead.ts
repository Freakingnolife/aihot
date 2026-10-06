// Which stories open the Recent page: the strongest featured ones, never just the newest.
import type { FeedItemSummary } from "@aihot/contracts/site";

const GRID_COUNT = 4;
const TOP_COUNT = 5;
const LATEST_COUNT = 8;
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

const BLURB_MAX = 200;
// A full stop that ends a sentence: followed by a space and a capital or digit, and not closing a dotted abbreviation ("U.S.").
const SENTENCE_END = /(?<![A-Z]\.[A-Z]\.)(?<=[.!?]["”’)]?)\s+(?=["“‘(]?[A-Z0-9])/;

/** The longest run of whole sentences within `max` characters, at least the first; a first sentence longer than that is cut at a word. */
export function wholeSentences(text: string, max = BLURB_MAX): string {
  const [first = "", ...more] = text.trim().split(SENTENCE_END);
  if (first.length > max) return `${first.slice(0, max).replace(/\s+\S*$/, "").replace(/[\s,;:.\-–—]+$/, "")}…`;
  let out = first;
  for (const next of more) {
    if (out.length + 1 + next.length > max) break;
    out += ` ${next}`;
  }
  return out;
}

/**
 * The front page's four groups and the rest of the list. Featured news from the newest 7 days competes on score
 * (the window reaches further back only to fill the lead and grid): the best one leads, the next four make the grid,
 * the next five the numbered "Top stories this week". "Latest" is the newest news of any status that is not already
 * shown above and does not read like a story already shown there or earlier in Latest, so each story appears once at the top.
 * A story whose headline reads like one already picked (see `sameEvent`) is skipped for these groups, not hidden: it stays
 * in the chronological list, as does everything else not leading, in the grid or in the top stories (that list is the complete record).
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
  const shown = new Set([...(lead ? [lead] : []), ...grid, ...top]);
  const latest: FeedItemSummary[] = [];
  for (const it of items.filter((it) => it.channel === "news").sort((a, b) => when(b) - when(a))) {
    if (latest.length === LATEST_COUNT) break;
    if (!shown.has(it) && ![...shown, ...latest].some((s) => sameEvent(s.title, it.title))) latest.push(it);
  }
  return { lead, grid, top, latest, rest: items.filter((it) => !shown.has(it)) };
}
