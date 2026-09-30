import { SITE, withSubject } from "@aihot/industry/site";
import { Link, useLoaderData, useNavigation, useSearchParams } from "react-router";
import type { Route } from "./+types/all";
import type { PoolResponse } from "@aihot/contracts/site";
import { isCategoryKey, isChannelKey } from "@aihot/contracts/taxonomy";
import { loadOr404, queryString } from "../lib/api.server";
import { listPath, pageMeta } from "../lib/seo";
import { CategoryTabs, SearchField } from "../features/feed/Filters";
import { PillTabs } from "../components/ui/Tabs";
import { DayList, Pagination } from "../features/feed/DayList";
import { EmptyState } from "../components/ui/Page";
import { RingMark } from "../components/Logo";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") === "archive" ? "archive" : "recent";
  const channelParam = url.searchParams.get("channel") ?? "all";
  const categoryParam = url.searchParams.get("category");
  const channel = isChannelKey(channelParam) ? channelParam : "all";
  const category = categoryParam && isCategoryKey(categoryParam) ? categoryParam : null;
  const tag = url.searchParams.get("tag")?.trim() || null;
  const q = url.searchParams.get("q")?.trim().slice(0, 200) || null;
  const tab = url.searchParams.get("tab") === "relevance" ? "relevance" : null;
  // Legacy deep-paging parameters (deep, anchorAt) still open a normal page.
  const page = Math.min(Math.max(Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1, 1), 50);
  const data = await loadOr404<PoolResponse>(
    `/api/site/pool${queryString({ mode, channel: channel === "all" ? null : channel, category, tag, q, tab, page: page > 1 ? page : null })}`,
    { signal: request.signal, busyRedirect: "/all/search-busy" },
  );
  return { data };
}

export function meta({ loaderData }: Route.MetaArgs) {
  const f = loaderData?.data.filters;
  const q = f?.q;
  const page = loaderData?.data.page ?? 1;
  return pageMeta({
    title: q ? `Search: ${q}` : `${f?.mode === "archive" ? "Archive" : "Recent"} drafts`,
    description: `Private drafts from ${SITE.name}, filtered by original publication date.`,
    path: listPath("/all", { mode: f?.mode, channel: f && f.channel !== "all" ? f.channel : null, category: f?.category, tag: f?.tag, q, tab: f?.tab === "relevance" ? "relevance" : null, page: page > 1 ? page : null }),
    noindex: !!q,
  });
}

export function headers() {
  return { "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=30" };
}

function pageHref(params: URLSearchParams, page: number) {
  const sp = new URLSearchParams(params);
  sp.delete("deep");
  sp.delete("anchorAt");
  sp.delete("search");
  if (page <= 1) sp.delete("page");
  else sp.set("page", String(page));
  const s = sp.toString();
  return s ? `/all?${s}` : "/all";
}

export default function AllPage() {
  const { data } = useLoaderData<typeof loader>();
  const [params] = useSearchParams();
  const navigation = useNavigation();
  const f = data.filters;
  const busy = navigation.state === "loading" && navigation.location?.pathname === "/all";
  const mode = f.mode ?? "recent";
  const keep = { mode, channel: f.channel === "all" ? null : f.channel, category: f.category, tag: f.tag, tab: f.tab };
  const modeHref = (mode: string) => { const sp = new URLSearchParams(params); sp.set("mode", mode); sp.delete("page"); return `/all?${sp}`; };
  const searchTabHref = (tab: "time" | "relevance") => {
    const sp = new URLSearchParams(params);
    sp.delete("page");
    if (tab === "relevance") sp.set("tab", "relevance");
    else sp.delete("tab");
    return `/all?${sp}`;
  };
  const title = f.q ? `Search“${f.q}”` : f.tag ? `#${f.tag}` : null;


  return (
    <div className="pb-6">
      {/* Desktop, as on Selected: the title, then one filter row with the search field aligned on the right. */}
      <div className="hidden lg:block">
        <h1 className="text-[24px] font-semibold leading-[1.3] text-ink">{title ?? `${mode === "archive" ? "Archive" : "Recent"} drafts`}</h1>
        <div className="mb-5 mt-4 flex flex-wrap items-center justify-between gap-3">
          <CategoryTabs base="/all" category={f.category} channel={f.channel} layoutId="all-cat-desk" className="min-w-0 max-w-full" />
          <SearchField variant="track" defaultValue={f.q ?? ""} keep={keep} />
        </div>
      </div>

      {/* Phones: title with today's count, the search bar, then the same filter row as Selected. */}
      <div className="lg:hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-2 pb-3 pt-5">
          <h1 className="text-[22px] font-bold text-ink">{title ?? `${mode === "archive" ? "Archive" : "Recent"} drafts`}</h1>
          {!f.q && (
            <span className="text-[12.5px] text-ink-4">
              Published today <span className="num">{data.todayCount}</span> drafts
            </span>
          )}
        </div>
        <SearchField variant="bar" defaultValue={f.q ?? ""} keep={keep} autoFocus={params.get("search") === "1"} />
        <div className="-mx-4 mt-3 border-b border-line-soft px-4 pb-3">
          <CategoryTabs base="/all" category={f.category} channel={f.channel} layoutId="all-cat-mobile" size="sm" className="min-w-0 max-w-full" />
        </div>
      </div>

      <div className="my-4 space-y-2">
        <PillTabs label="Publication period" layoutId="pool-mode" active={mode} items={[
          {key: "recent", label: "Recent", to: modeHref("recent")},
          {key: "archive", label: "Archive", to: modeHref("archive")},
        ]} />
        <p className="text-[13px] leading-relaxed text-ink-3">{mode === "recent" ? "Original publication dates within the last 30 days. Older and unknown-date drafts are in Archive." : "All available drafts, including older and unknown publication dates. Search relevance can place unknown-date matches first."}</p>
        <p className="text-[12px] leading-relaxed text-ink-4">Manual collection only. No continuous collection or scheduled reports. Import time does not make a story recent.</p>
      </div>

      {f.q && (
        <div className="mb-3 mt-3 flex flex-wrap items-center justify-between gap-2 lg:mt-0">
          <PillTabs
            size="xs"
            layoutId="all-search-sort"
            label="Search order"
            active={f.tab}
            items={(["time", "relevance"] as const).map((t) => ({ key: t, label: t === "time" ? "Latest (titles and summaries)" : "Full text", to: searchTabHref(t) }))}
          />
          <span className="text-[12px] text-ink-4">
            Found <span className="num">{data.total >= 2000 ? "2000+" : data.total}</span> drafts
          </span>
        </div>
      )}

      <div className={`transition-opacity duration-200 ${busy ? "opacity-50" : ""}`}>
        {data.items.length === 0 ? (
          <div className="mt-2 lg:card">
            <EmptyState
              title="No matching drafts"
              action={
                f.q && f.tab === "time" ? (
                  <Link to={searchTabHref("relevance")} className="text-[13px] font-medium text-accent hover:underline">
                    Try full-text search
                  </Link>
                ) : undefined
              }
            >
              {f.q ? "Try different words or clear the filters." : "No drafts match this filter."}
            </EmptyState>
          </div>
        ) : (
          <DayList items={data.items} todayCount={f.q ? null : data.todayCount} showTags originalDates />
        )}
      </div>
      <Pagination page={data.page} pageCount={data.pageCount} href={(p) => pageHref(params, p)} />
      {data.page >= 50 && <p className="mt-4 text-center text-[12px] text-ink-4">Up to 50 pages. Search for older drafts.</p>}
    </div>
  );
}

export function SearchBusy() {
  return (
    <div className="mx-auto max-w-sm py-24 text-center">
      <RingMark className="mx-auto mb-5 size-10 text-accent" spinning />
      <h1 className="text-[20px] font-bold text-ink">Search is busy</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-ink-3">Search is busy. Try again shortly or browse the list.</p>
      <div className="mt-6 flex justify-center gap-2.5">
        <Link to="/all" className="inline-flex h-9 items-center rounded-full bg-accent px-4 text-[13.5px] font-medium text-accent-contrast hover:bg-accent-ink">Browse recent drafts</Link>
        <Link to="/" className="inline-flex h-9 items-center rounded-full border border-line-strong bg-surface px-4 text-[13.5px] text-ink-2 hover:border-ink-4">Recent drafts</Link>
      </div>
    </div>
  );
}
