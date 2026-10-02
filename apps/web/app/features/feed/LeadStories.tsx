// The top of the first page: one large lead story and up to three beside it, so the page opens on pictures instead
// of a wall of text, then the "This week" overview. Which stories qualify is decided in ./lead.
import type { FeedItemSummary } from "@aihot/contracts/site";
import { IntentLink } from "../../components/ui/IntentLink";
import { Cover } from "../../components/ui/Cover";
import { markRead } from "../../lib/local-state";

const DAY = new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short", timeZone: "Asia/Shanghai" });

function Meta({ item }: { item: FeedItemSummary }) {
  return (
    <p className="flex flex-wrap items-baseline gap-x-2.5 text-[12.5px] leading-5 text-ink-4">
      <span className="font-semibold text-ink-2">{item.source.name}</span>
      {item.publishedAt && <time dateTime={item.publishedAt}>Published {DAY.format(new Date(item.publishedAt))}</time>}
      {item.backfill && <span>Historical import</span>}
    </p>
  );
}

function Title({ item, className }: { item: FeedItemSummary; className: string }) {
  return (
    <h2 className={`font-semibold text-ink ${className}`}>
      <IntentLink to={`/items/${item.id}`} onClick={() => markRead(item.id)} className="after:absolute after:inset-0 after:content-['']">
        {item.title}
      </IntentLink>
    </h2>
  );
}

function Lead({ item }: { item: FeedItemSummary }) {
  return (
    <article className="relative min-w-0" data-item-id={item.id}>
      <Cover cover={item.cover} seed={item.id} large ratio="aspect-[16/9]" sizes="(min-width: 961px) 680px, 100vw" />
      <div className="mt-3.5">
        <Meta item={item} />
        <Title item={item} className="mt-1.5 text-[28px] !font-normal leading-[1.15] tracking-[-0.035em] lg:text-[40px]" />
        {item.summary && <p className="mt-2.5 line-clamp-3 max-w-[62ch] text-[15px] leading-[1.7] text-ink-3">{item.summary}</p>}
      </div>
    </article>
  );
}

function Side({ item }: { item: FeedItemSummary }) {
  return (
    <article className="relative grid min-w-0 grid-cols-[132px_minmax(0,1fr)] items-start gap-3.5 lg:grid-cols-[152px_minmax(0,1fr)]" data-item-id={item.id}>
      <Cover cover={item.cover} seed={item.id} sizes="152px" />
      <div className="min-w-0">
        <Meta item={item} />
        <Title item={item} className="mt-1 line-clamp-5 text-[17px] leading-[1.25] lg:text-[19px]" />
      </div>
    </article>
  );
}

export function LeadStories({ items }: { items: FeedItemSummary[] }) {
  const [first, ...side] = items;
  if (!first) return null;
  return (
    <section aria-label="Top stories" className="mb-8 grid gap-6 border-b border-line pb-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-8">
      <Lead item={first} />
      {side.length > 0 && <div className="grid content-start gap-6 lg:gap-7">{side.map((it) => <Side key={it.id} item={it} />)}</div>}
    </section>
  );
}

/** The next featured stories as a compact list: headline, publisher, date and why it matters. */
export function WeekOverview({ items }: { items: FeedItemSummary[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="this-week" className="mb-8 border-b border-line pb-8">
      <h2 id="this-week" className="text-[18px] font-semibold leading-8 text-ink">This week in 3D printing</h2>
      <ol className="mt-2 divide-y divide-line-soft">
        {items.map((item) => (
          <li key={item.id} className="relative min-w-0 py-3.5" data-item-id={item.id}>
            <Meta item={item} />
            <h3 className="mt-1 text-[16px] font-semibold leading-[1.4] text-ink">
              <IntentLink to={`/items/${item.id}`} onClick={() => markRead(item.id)} className="after:absolute after:inset-0 after:content-['']">
                {item.title}
              </IntentLink>
            </h3>
            {item.reason && (
              <p className="mt-1 max-w-[75ch] text-[13px] leading-[1.65] text-ink-3">
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
