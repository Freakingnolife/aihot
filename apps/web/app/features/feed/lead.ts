// Which stories open the Recent page: the strongest featured ones, never just the newest.
import type { FeedItemSummary } from "@aihot/contracts/site";

const HERO_COUNT = 4;
const OVERVIEW_COUNT = 5;
const WINDOW_MS = 7 * 86400000;

const when = (it: FeedItemSummary) => Date.parse(it.publishedAt ?? it.timelineAt);
const strongest = (a: FeedItemSummary, b: FeedItemSummary) => (b.score ?? 0) - (a.score ?? 0) || when(b) - when(a);

/**
 * The lead stories, the "This week" overview and the rest of the page. Featured news from the newest 7 days
 * that have content competes on score (the window reaches further back only to fill the lead); the best four lead,
 * the next five make the overview, and everything else keeps the chronological list.
 */
export function splitLead(items: FeedItemSummary[]): { lead: FeedItemSummary[]; overview: FeedItemSummary[]; rest: FeedItemSummary[] } {
  const featured = items.filter((it) => it.channel === "news" && it.selected).sort((a, b) => when(b) - when(a));
  const newest = featured[0] ? when(featured[0]) : 0;
  const recent = featured.filter((it) => when(it) >= newest - WINDOW_MS);
  const ranked = (recent.length >= HERO_COUNT ? recent : featured.slice(0, HERO_COUNT)).sort(strongest);
  const lead = ranked.slice(0, HERO_COUNT);
  const overview = ranked.slice(HERO_COUNT, HERO_COUNT + OVERVIEW_COUNT);
  const shown = new Set([...lead, ...overview]);
  return { lead, overview, rest: items.filter((it) => !shown.has(it)) };
}
