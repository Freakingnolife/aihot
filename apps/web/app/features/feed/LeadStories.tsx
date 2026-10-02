// The top of the first page, laid out like a front page: the lead story with four more beneath it, a "Latest" stream
// beside them, then the numbered "Top stories this week". Which stories go where is decided in ./lead.
import type { FeedItemSummary } from "@aihot/contracts/site";
import { IntentLink } from "../../components/ui/IntentLink";
import { Cover } from "../../components/ui/Cover";
import { markRead } from "../../lib/local-state";
import { displayTitle } from "../../lib/format";

const DAY = new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short", timeZone: "Asia/Shanghai" });

/** Publisher · date. */
function Meta({ item }: { item: FeedItemSummary }) {
  return (
    <p className="text-[12px] leading-[1.35] text-ink-4">
      <span className="font-semibold text-ink-2">{item.source.name}</span>
      {item.publishedAt && (
        <>
          <span aria-hidden="true"> · </span>
          <time dateTime={item.publishedAt}>{DAY.format(new Date(item.publishedAt))}</time>
        </>
      )}
    </p>
  );
}

/** A headline whose link covers its whole (relatively positioned) card. */
function Title({ item, as: Tag = "h2", className }: { item: FeedItemSummary; as?: "h2" | "h3"; className: string }) {
  return (
    <Tag className={`font-semibold text-ink ${className}`}>
      <IntentLink to={`/items/${item.id}`} onClick={() => markRead(item.id)} className="after:absolute after:inset-0 after:content-['']">
        {displayTitle(item.title, item.source.name)}
      </IntentLink>
    </Tag>
  );
}

function Lead({ item }: { item: FeedItemSummary }) {
  return (
    <article className="relative min-w-0" data-item-id={item.id}>
      <Cover cover={item.cover} seed={item.id} large ratio="aspect-[16/9]" sizes="(min-width: 961px) 720px, 100vw" />
      <div className="mt-3.5">
        <Title item={item} className="text-[28px] !font-normal leading-[1.15] tracking-[-0.035em] lg:text-[40px]" />
        {item.summary && <p className="mt-2.5 line-clamp-2 max-w-[62ch] text-[16px] leading-[1.5] text-ink-3">{item.summary}</p>}
        <div className="mt-2.5">
          <Meta item={item} />
        </div>
      </div>
    </article>
  );
}

function Compact({ item }: { item: FeedItemSummary }) {
  return (
    <article className="relative grid min-w-0 grid-cols-[104px_minmax(0,1fr)] items-start gap-3.5 lg:grid-cols-[112px_minmax(0,1fr)]" data-item-id={item.id}>
      <Cover cover={item.cover} seed={item.id} sizes="112px" credit={false} />
      <div className="min-w-0">
        <Title item={item} className="line-clamp-4 text-[16px] leading-[1.35]" />
        <div className="mt-1.5">
          <Meta item={item} />
        </div>
      </div>
    </article>
  );
}

/** The newest stories of any status, as plain rows: publisher, date, headline. */
function LatestStream({ items }: { items: FeedItemSummary[] }) {
  return (
    <aside aria-labelledby="latest-stream" className="min-w-0 border-t border-line pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
      <div className="flex items-baseline justify-between gap-3 border-b border-line pb-3">
        <h2 id="latest-stream" className="text-[18px] font-semibold leading-[1.35] text-ink">Latest</h2>
        <a href="#more-news" className="text-[12px] font-semibold text-accent hover:underline">See all</a>
      </div>
      <ol className="divide-y divide-line-soft">
        {items.map((item) => (
          <li key={item.id} className="relative min-w-0 py-3.5" data-item-id={item.id}>
            <Meta item={item} />
            <Title item={item} as="h3" className="mt-1 line-clamp-3 text-[16px] leading-[1.4]" />
          </li>
        ))}
      </ol>
    </aside>
  );
}

export function LeadStories({ lead, grid, latest }: { lead: FeedItemSummary | null; grid: FeedItemSummary[]; latest: FeedItemSummary[] }) {
  if (!lead) return null;
  return (
    <section aria-label="Top of the news" className={`mb-10 grid gap-8 ${latest.length > 0 ? "lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" : ""}`}>
      <div className={`min-w-0 ${latest.length > 0 ? "lg:pr-8" : ""}`}>
        <Lead item={lead} />
        {grid.length > 0 && (
          <div className="mt-7 grid gap-x-8 gap-y-6 border-t border-line pt-6 lg:grid-cols-2">
            {grid.map((it) => <Compact key={it.id} item={it} />)}
          </div>
        )}
      </div>
      {latest.length > 0 && <LatestStream items={latest} />}
    </section>
  );
}

/** The strongest featured stories after the lead and grid, numbered, each with why it matters. */
export function TopStories({ items }: { items: FeedItemSummary[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="top-stories" className="mb-10">
      <h2 id="top-stories" className="border-t-2 border-accent pt-3 text-[24px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink">
        Top stories this week
      </h2>
      <ol className="mt-3 divide-y divide-line-soft border-b border-line">
        {items.map((item, i) => (
          <li key={item.id} className="relative grid min-w-0 grid-cols-[44px_minmax(0,1fr)] gap-x-4 gap-y-2 py-5 lg:grid-cols-[72px_minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-x-8" data-item-id={item.id}>
            <span aria-hidden="true" className="num text-[36px] font-normal leading-none text-ink lg:text-[52px]">{i + 1}</span>
            <div className="min-w-0">
              <Title item={item} as="h3" className="text-[18px] leading-[1.35] lg:text-[20px]" />
              <div className="mt-1.5">
                <Meta item={item} />
              </div>
            </div>
            {item.reason && (
              <p className="col-start-2 text-[14px] leading-[1.6] text-ink-3 lg:col-start-3">
                <span className="font-semibold text-ink-2">Why it matters </span>
                {item.reason}
              </p>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
