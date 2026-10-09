import type { FeedItemSummary } from "@aihot/contracts/site";

/** Publisher count and direct original links for a folded event, shared by every card style. */
export function EventSources({ item, className = "" }: { item: FeedItemSummary; className?: string }) {
  const event = item.event;
  if (!event || event.reports.length < 2) return null;
  return (
    <details className={`relative z-10 mt-2 text-[12.5px] text-ink-4 ${className}`}>
      <summary className="w-fit cursor-pointer list-inside font-medium text-accent hover:underline">
        {event.sourceCount} {event.sourceCount === 1 ? "source" : "sources"}
        {event.reports.length !== event.sourceCount && <span className="font-normal text-ink-4"> · {event.reports.length} reports</span>}
      </summary>
      <ul className="mt-2 max-w-2xl divide-y divide-line-soft rounded-control bg-bg-sunk px-3 dark:bg-bg-muted/60">
        {event.reports.map((report, index) => (
          <li key={`${report.originalUrl}-${index}`} className="flex items-baseline gap-2 py-2 text-[13px]">
            <span className="w-[108px] shrink-0 truncate text-ink-4">{report.source}</span>
            <a href={report.originalUrl} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 text-ink-2 hover:text-accent">{report.title}</a>
          </li>
        ))}
      </ul>
    </details>
  );
}
