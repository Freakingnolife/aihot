import { SITE, withSubject } from "@aihot/industry/site";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Link, useLoaderData, useNavigate } from "react-router";
import type { Route } from "./+types/item";
import type { SiteItemDetail } from "@aihot/contracts/site";
import { loadOr404 } from "../lib/api.server";
import { breadcrumbLd, pageMeta, siteUrl, titled } from "../lib/seo";
import { beijingDate, displayTitle, fullDateTime } from "../lib/format";
import { markRead } from "../lib/local-state";
import { SelectedBadge } from "../components/ui/Badge";
import { PillTabs } from "../components/ui/Tabs";
import { ArticleLayout, RailSection } from "../components/ui/Page";
import { Menu, MenuItem } from "../components/ui/Menu";
import { StarButton } from "../features/feed/parts";
import { GroupSources } from "../features/feed/ReadingGroup";
import { StoryFollowups } from "../features/item/StoryFollowups";
import { MediaGallery } from "../features/item/MediaGallery";
import { QuotedPost } from "../features/item/QuotedPost";
import { IconArrowLeft, IconCopy, IconDownload, IconExternal, IconImage, IconMenu, IconShare } from "../components/icons";

const PosterSheet = lazy(() => import("../features/item/PosterSheet"));

export async function loader({ params, request }: Route.LoaderArgs) {
  const item = await loadOr404<SiteItemDetail>(`/api/site/items/${encodeURIComponent(params.id)}`, { signal: request.signal });
  return { item };
}

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return [{ title: titled("Story not found") }, { name: "robots", content: "noindex" }];
  const { item } = loaderData;
  return pageMeta({
    title: displayTitle(item.title, item.source.name),
    description: item.summary ?? undefined,
    path: `/items/${item.id}`,
    image: `/og/items/${item.id}.png`,
    type: "article",
    noindex: !item.indexable,
    jsonLd: breadcrumbLd([
      { name: SITE.name, path: "/" },
      { name: "Archive", path: "/all?mode=archive" },
      { name: displayTitle(item.title, item.source.name), path: `/items/${item.id}` },
    ]),
  });
}

export function headers() {
  return { "Cache-Control": "public, max-age=0, s-maxage=600, stale-while-revalidate=120" };
}

/** A 2px accent line across the top that follows long bodies. */
function ReadingProgress() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (ref.current) ref.current.style.transform = `scaleX(${max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0})`;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);
  return <div ref={ref} aria-hidden="true" className="fixed inset-x-0 top-0 z-50 h-[2px] origin-left scale-x-0 bg-accent transition-transform duration-150 ease-out" />;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

async function shareOrCopy(item: Pick<SiteItemDetail, "id" | "title" | "source">): Promise<"shared" | "copied" | null> {
  const title = displayTitle(item.title, item.source.name);
  const url = `${siteUrl()}/items/${item.id}`;
  try {
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
      await navigator.share({ title, url });
      return "shared";
    }
    await navigator.clipboard.writeText(`${title}\n${url}`);
    return "copied";
  } catch {
    return null;
  }
}

export default function ItemPage() {
  const { item } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const hasTranslation = item.hasTranslation;
  const lang = item.bodyLanguage;
  const [posterRequested, setPosterRequested] = useState(false);
  const [posterOpen, setPosterOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => markRead(item.id), [item.id]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1600);
    return () => clearTimeout(t);
  }, [toast]);
  const closePoster = useCallback(() => setPosterOpen(false), []);
  const openPoster = () => {
    setPosterRequested(true);
    setPosterOpen(true);
  };
  const share = async () => {
    const r = await shareOrCopy(item);
    if (r === "copied") setToast("Link copied");
  };

  const bodyHtml = lang === "zh" ? (item.body?.zh ?? item.body?.original) : (item.body?.original ?? item.body?.zh);
  const bodyLabel = !item.body ? null : lang === "zh" && item.body.zhKind === "translation" ? "Body · translation" : lang === "original" && hasTranslation ? "Body · original" : "Body";
  const isX = item.channel === "x" && !!item.x;
  const publishedIso = item.publishedAt ? beijingDate(item.publishedAt) : item.discoveredAt;
  const publishedLabel = item.publishedAt ? beijingDate(item.publishedAt) : fullDateTime(item.discoveredAt);
  const summaryOnly = item.readingMode === "summary-only";
  const showOutline = item.outline.length >= 3;
  const originalLabel = isX ? "View original on X" : "Read original";

  const related = item.relatedStories.filter((s) => s.publicId !== item.story?.publicId);

  const back = () => {
    if (window.history.state?.idx > 0) navigate(-1);
    else navigate("/all?mode=archive");
  };
  const backButton = (
    <button type="button" onClick={back} className="-ml-1.5 inline-flex min-h-8 items-center gap-1.5 rounded-full px-1.5 py-1 text-[14px] text-ink-2 transition-colors hover:text-ink lg:text-[13px] lg:text-ink-3">
      <IconArrowLeft size={16} /> Back
    </button>
  );
  const moreMenu = (
    <Menu label="More actions" trigger={<IconMenu size={17} />}>
      {(close) => (
        <>
          <MenuItem icon={<IconShare size={15} />} onSelect={() => { close(); void share(); }}>Share link</MenuItem>
          <MenuItem icon={<IconImage size={15} />} onSelect={() => { close(); openPoster(); }}>Create share image</MenuItem>
          <MenuItem
            icon={<IconCopy size={15} />}
            onSelect={async () => {
              close();
              try {
                await navigator.clipboard.writeText(`${siteUrl()}/items/${item.id}`);
                setToast("Link copied");
              } catch {
                // clipboard unavailable
              }
            }}
          >
            Copy link
          </MenuItem>
          {item.markdownAvailable && (
            <MenuItem icon={<IconDownload size={15} />} href={`/items/${item.id}/markdown`} download onSelect={close}>
              Export Markdown
            </MenuItem>
          )}
        </>
      )}
    </Menu>
  );
  // Desktop actions head the right rail, one row as tall as Back at the head of the left one.
  const actions = (
    <div className="flex items-center gap-1">
      <a
        href={item.links.original}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full border border-line-strong bg-surface px-3.5 py-1 text-[12.5px] font-medium text-ink-2 transition-colors hover:border-ink-4 hover:text-ink"
      >
        {originalLabel} <IconExternal size={13} />
      </a>
      <StarButton item={item} size={32} />
      {moreMenu}
    </div>
  );
  const verdict = item.selected && (
    <div className="flex items-center gap-2">
      <SelectedBadge />
    </div>
  );

  // Rails: the piece's facts on the left (wide screens), the editor's notes on the right, the outline
  // under the facts (or under the notes when only the right rail shows).
  const facts = (
    <RailSection title="Source">
      <div className="text-[14px] font-semibold leading-snug text-ink">{isX ? item.x!.authorName : item.source.name}</div>
      <div className="mt-1 text-[12.5px] leading-relaxed text-ink-3">
        {isX ? `@${item.x!.handle} · X` : hostOf(item.links.original)}
      </div>
      <div className="mt-3 text-[12px] text-ink-4">{item.publishedAt ? "Published" : "Publication date unknown · collected"}</div>
      <time dateTime={publishedIso} className="mono mt-0.5 block text-[12.5px] text-ink-2">
        {publishedLabel}
      </time>
    </RailSection>
  );
  const outline = showOutline && (
    <RailSection title="Contents">
      <nav aria-label="Contents">
        <ol className="-ml-px space-y-0.5 border-l border-line">
          {item.outline.map((o) => (
            <li key={o.id}>
              <a href={`#${o.id}`} className={`-ml-px block border-l border-transparent py-1 text-[12.5px] leading-snug text-ink-3 transition-colors hover:border-accent hover:text-ink ${o.level > 2 ? "pl-5" : "pl-3"}`}>
                {o.text}
              </a>
            </li>
          ))}
        </ol>
      </nav>
    </RailSection>
  );
  const notes = (
    <>
      {item.reason && !summaryOnly ? (
        <RailSection title="Why it matters">
          {verdict && <div className="mb-3">{verdict}</div>}
          <p className="text-[13.5px] leading-[1.8] text-ink-2">{item.reason}</p>
        </RailSection>
      ) : (
        verdict && <RailSection title="Status">{verdict}</RailSection>
      )}
      {item.tags.length > 0 && (
        <RailSection title="Tags">
          <div className="flex flex-wrap gap-1.5">
            {item.tags.slice(0, 8).map((t) => (
              <Link key={t} to={`/all?tag=${encodeURIComponent(t)}`} className="chip">
                #{t}
              </Link>
            ))}
          </div>
        </RailSection>
      )}
    </>
  );

  return (
    <div className="mx-auto max-w-[var(--page-max-reading)] pb-8">
      {item.body && <ReadingProgress />}

      {/* Phones: a sticky bar with back, Bookmarks, the original, share and more. Desktop puts these in the rails. */}
      <div className="sticky top-0 z-30 -mx-4 flex min-h-12 flex-wrap items-center gap-1.5 border-b border-line-soft bg-bg/95 px-4 py-1.5 backdrop-blur lg:hidden">
        {backButton}
        <span className="flex-1" />
        <StarButton item={item} size={32} />
        <a href={item.links.original} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 items-center gap-1 px-1.5 py-1 text-[14px] text-ink-2">
          <IconExternal size={15} /> Original
        </a>
        <button type="button" aria-label="Share" onClick={share} className="inline-flex size-8 items-center justify-center rounded-full text-ink-3 hover:text-ink">
          <IconShare size={17} />
        </button>
        {moreMenu}
      </div>

      {/* The text on the page in one column; back and the facts in the left rail, actions and notes in the right. */}
      <ArticleLayout
        left={
          <>
            {backButton}
            {facts}
            {outline}
          </>
        }
        right={
          <>
            {actions}
            {notes}
            <div className="space-y-8 2xl:hidden">{outline}</div>
          </>
        }
      >
        <div className="hidden lg:block 2xl:hidden">{backButton}</div>
        <article className="pb-6 pt-6 lg:pt-2 2xl:pt-1">
          <div className={`flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-ink-3 2xl:hidden ${isX ? "" : "mb-3"}`}>
            <span className="font-semibold text-ink-2">{isX ? item.x!.authorName : item.source.name}</span>
            {isX && <span>· @{item.x!.handle} · X</span>}
            <span>·</span>
            {!item.publishedAt && <span>Original date unknown · discovered</span>}
            <time dateTime={publishedIso} className="mono">{publishedLabel}</time>
            {item.selected && (
              <span className="ml-1 min-w-0 max-w-full lg:hidden">
                <SelectedBadge />
              </span>
            )}
          </div>
          {!isX && <h1 className="text-[30px] font-normal leading-[1.15] tracking-[-0.035em] text-ink lg:text-[40px] xl:text-[44px]">{displayTitle(item.title, item.source.name)}</h1>}

          {item.summary && (
            <section className={isX ? "mt-4" : "mt-7 xl:mt-8"}>
              <div className="mb-2 text-[12px] font-semibold text-accent">{summaryOnly ? "Summary" : "Summary"}</div>
              <p className="text-[18px] leading-[1.7] text-ink xl:text-[20px] xl:leading-[1.7]">{item.summary}</p>
            </section>
          )}

          {item.reason && !summaryOnly && (
            <section className="mt-6 border-t border-line pt-4 lg:hidden">
              <div className="mb-1 text-[12px] font-semibold text-ink-3">Why it matters</div>
              <p className="text-[15px] leading-[1.75] text-ink-2">{item.reason}</p>
            </section>
          )}

          {item.group && item.group.reportCount > 1 && (
            <div className="mt-5">
              <GroupSources group={item.group} parentId={item.id} />
            </div>
          )}

          {summaryOnly && <p className="mt-7 rounded-control bg-bg-sunk px-4 py-3 text-[13.5px] leading-relaxed text-ink-3">This private pilot shows summaries and source links only. Read the publisher’s original for full context.</p>}

          {item.body && bodyHtml && (
            <section className="mt-9 border-t border-line pt-4 xl:mt-10">
              <div className="mb-6 flex items-center justify-between gap-3">
                <span className="text-[12px] text-ink-4">{bodyLabel}</span>
                {hasTranslation && (
                  <PillTabs
                    size="xs"
                    layoutId="item-body-lang"
                    label="Body language"
                    active={lang}
                    items={[
                      { key: "zh", label: "English", prefetch: "intent", replace: true, to: `/items/${item.id}` },
                      { key: "original", label: "Original", prefetch: "intent", replace: true, to: `/items/${item.id}/original` },
                    ]}
                  />
                )}
              </div>
              {hasTranslation && lang === "zh" && !item.body.complete && (
                <p className="mb-5 rounded-control bg-bg-sunk px-3 py-2 text-[13px] text-ink-3">Translation is incomplete. Read the original for full context.</p>
              )}
              <div className="prose" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
            </section>
          )}

          {isX && item.x!.media.length > 0 && <MediaGallery media={item.x!.media} postUrl={item.links.original} />}
          {isX && item.x!.quoted?.text && <QuotedPost quoted={item.x!.quoted} original={lang === "original"} />}

          <p className="mt-8 text-[13px] text-ink-4">
            Source:{" "}
            <a href={item.links.original} target="_blank" rel="noopener noreferrer" className="text-ink-3 hover:text-accent">
              {isX ? item.x!.authorName : item.source.name}
            </a>
            <span> · {hostOf(item.links.original)}</span>
          </p>

          {item.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5 lg:hidden">
              {item.tags.slice(0, 6).map((t) => (
                <Link key={t} to={`/all?tag=${encodeURIComponent(t)}`} className="chip">
                  #{t}
                </Link>
              ))}
            </div>
          )}

          {item.story && <StoryFollowups story={item.story} currentId={item.id} />}

          {related.length > 0 && (
            <section className="mt-8">
              <h2 className="mb-2 text-[14px] font-semibold text-ink">Related stories</h2>
              <ul className="divide-y divide-line-soft">
                {related.map((s) => (
                  <li key={s.publicId}>
                    <Link to={`/story/${s.publicId}`} className="block py-2.5 text-[14px] text-ink-2 hover:text-accent">
                      {s.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </article>
      </ArticleLayout>

      {posterRequested && (
        <Suspense fallback={null}>
          <PosterSheet id={item.id} title={displayTitle(item.title, item.source.name)} open={posterOpen} onClose={closePoster} />
        </Suspense>
      )}
      {toast && (
        <div role="status" className="fixed bottom-[calc(80px+env(safe-area-inset-bottom))] left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-[13px] text-bg shadow-[var(--shadow-pop)] lg:bottom-8">
          {toast}
        </div>
      )}
    </div>
  );
}
