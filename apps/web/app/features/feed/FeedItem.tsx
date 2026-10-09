// One report in a feed. Desktop (≥ 961px): a white card beside the time rail. Mobile: a compact row
// with a divider, the reason in a grey box. One markup, two presentations, as on the original site.
import { displayTitle, fullDateTime } from "../../lib/format";
import { memo } from "react";
import { Link } from "react-router";
import { IntentLink } from "../../components/ui/IntentLink";
import type { GroupInfo, FeedItemSummary, TimelineFilters } from "@aihot/contracts/site";
import { CATEGORY_LABELS } from "@aihot/contracts/taxonomy";
import { SelectedBadge } from "../../components/ui/Badge";
import { Cover } from "../../components/ui/Cover";
import { MediaThumbs, SourceLine, StarButton } from "./parts";
import { GroupDevelopments, GroupSources, LatestDevelopment } from "./ReadingGroup";
import { QuotedLine } from "../item/QuotedPost";
import { EventSources } from "./EventSources";

export interface FeedItemProps {
  item: FeedItemSummary;
  group?: GroupInfo | null;
  filters?: TimelineFilters;
  read?: boolean;
  onOpen?: (id: string) => void;
  /** Show category and tags under the text (All drafts, topics, search). */
  showTags?: boolean;
}

export const FeedItem = memo(function FeedItem({ item, group, filters, read = false, onOpen, showTags = false }: FeedItemProps) {
  const isX = item.channel === "x" && !!item.x;
  const open = () => onOpen?.(item.id);
  const showSources = !!group && (group.additionalSourceCount > 0 || (group.developmentCount <= 1 && group.reportCount > 1));
  const showDevelopments = !!group?.story && group.developmentCount > 1;
  // A tag that repeats the category label ("Industry" and #Industry) adds nothing next to it.
  const categoryLabel = item.category ? CATEGORY_LABELS[item.category].toLowerCase() : null;
  const tags = showTags ? item.tags.filter((t) => t.toLowerCase() !== categoryLabel).slice(0, 3) : [];

  return (
    <article className="relative flex min-w-0 items-start gap-3.5 lg:card lg:card-hover lg:gap-5 lg:px-[18px] lg:pb-[14px] lg:pt-[15px]" data-item-id={item.id}>
      <div className="min-w-0 flex-1">
        <header className="flex min-h-[18px] items-center gap-2 text-[12.5px] leading-[18px] text-ink-4">
          <SourceLine item={item} className="text-ink-4" />
          {item.selected && (
            <span className="hidden lg:inline-flex">
              <SelectedBadge />
            </span>
          )}
          <span className="ml-auto flex shrink-0 items-center gap-1.5 pl-2">
            <span className="-my-1 hidden lg:inline-flex">
              <StarButton item={item} />
            </span>
          </span>
        </header>

        {!item.publishedAt && <p className="mt-2 text-xs text-ink-3">{`Original date unknown · discovered ${fullDateTime(item.discoveredAt ?? item.timelineAt)}`}</p>}
        {isX ? (
          <p className={`mt-2 whitespace-pre-line text-[15px] leading-[1.75] line-clamp-5 lg:line-clamp-4 ${read ? "text-ink-4" : "text-ink"}`}>
            <IntentLink to={`/items/${item.id}`} onClick={open} className="after:absolute after:inset-0 after:content-['']">
              {item.summary ?? displayTitle(item.title, item.source.name)}
            </IntentLink>
          </p>
        ) : (
          <>
            <h3 className={`mt-2 line-clamp-3 text-[17px] font-bold leading-[1.55] lg:line-clamp-none lg:font-[650] ${read ? "text-ink-4" : "text-ink"}`}>
              <IntentLink to={`/items/${item.id}`} onClick={open} className="after:absolute after:inset-0 after:content-['']">
                {displayTitle(item.title, item.source.name)}
              </IntentLink>
            </h3>
            {item.summary && <p className="mt-1.5 line-clamp-2 max-w-[75ch] text-[14.5px] leading-[1.75] text-ink-3 lg:mt-2 lg:line-clamp-3 lg:text-[15px]">{item.summary}</p>}
          </>
        )}

        {isX && item.x!.media.length > 0 && <MediaThumbs media={item.x!.media} className="mt-2.5" />}
        {isX && item.x!.quoted?.text && <QuotedLine quoted={item.x!.quoted} />}

        {(tags.length > 0 || (showTags && item.category)) && (
          <div className="relative z-10 mt-2 hidden flex-wrap gap-x-2.5 gap-y-1 text-[12px] text-ink-4 lg:flex">
            {showTags && item.category && (
              <Link to={`/all?category=${item.category}`} className="hover:text-accent">
                {CATEGORY_LABELS[item.category]}
              </Link>
            )}
            {tags.map((t) => (
              <Link key={t} to={`/all?tag=${encodeURIComponent(t)}`} className="hover:text-accent">
                #{t}
              </Link>
            ))}
          </div>
        )}

        {group && <LatestDevelopment group={group} />}
        <EventSources item={item} />
        {(showSources || showDevelopments) && (
          <div className="mt-2 flex flex-wrap items-start gap-x-4 gap-y-1">
            {showSources && <GroupSources group={group!} filters={filters} parentId={item.id} />}
            {showDevelopments && <GroupDevelopments group={{ ...group!, story: group!.story! }} filters={filters} parentId={item.id} />}
          </div>
        )}

        {item.reason && (
          <div className="mt-2.5 rounded-control bg-bg-sunk px-3 py-2 dark:bg-bg-muted/60 lg:mt-3 lg:rounded-none lg:border-t lg:border-line-soft lg:bg-transparent lg:px-0 lg:pb-0 lg:pt-3 lg:dark:bg-transparent">
            <p className="line-clamp-2 text-[13px] leading-[1.65] text-ink-3 lg:line-clamp-none lg:leading-[1.75] lg:text-note">{item.reason}</p>
          </div>
        )}
      </div>
      {!isX && <Cover cover={item.cover} seed={item.id} label={item.category ? CATEGORY_LABELS[item.category] : item.source.name} sizes="(min-width: 961px) 216px, 104px" className="w-[104px] shrink-0 lg:w-[216px]" />}
    </article>
  );
});
