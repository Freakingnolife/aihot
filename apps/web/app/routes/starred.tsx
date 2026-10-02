import { SITE } from "@aihot/industry/site";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Presence } from "../components/ui/Presence";
import { pageMeta } from "../lib/seo";
import { exportBundle, importBundle, removeStar, useStarred, type ImportReport } from "../lib/local-state";
import { displayTitle, fullDateTime, shortSourceName } from "../lib/format";
import { IconBookmark, IconDownload, IconClose } from "../components/icons";

/** Shared caches may keep this page for five minutes. */
export function headers() {
  return { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600" };
}

export function meta() {
  return pageMeta({ title: "My bookmarks", description: `Saved on this device: ${SITE.name} Bookmarks。`, path: "/starred", noindex: true });
}

function reportText(r: ImportReport): string {
  const parts = [`Added ${r.starredAdded} bookmarks`, `Added ${r.readAdded} read records`];
  if (r.starredSkipped || r.readSkipped) parts.push(`Skipped ${r.starredSkipped + r.readSkipped} invalid or excess records`);
  if (r.themeApplied) parts.push("Imported preference retained");
  if (r.readFailed) parts.push("Read history could not be saved. Browser storage is full or unavailable.");
  return parts.join("，");
}


export default function StarredPage() {
  const starred = useStarred();
  const [mounted, setMounted] = useState(false);
  const [availability, setAvailability] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => setMounted(true), []);

  const starredIds = starred.map((s) => s.id).join(",");
  useEffect(() => {
    if (!mounted || !starredIds) return;
    const controller = new AbortController();
    fetch(`/api/site/items/availability?ids=${encodeURIComponent(starredIds)}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : {}))
      .then((data) => { if (!controller.signal.aborted) setAvailability(data); })
      .catch(() => {});
    return () => controller.abort();
  }, [mounted, starredIds]);

  const doExport = () => {
    const blob = new Blob([JSON.stringify(exportBundle(), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${SITE.mcpPrefix}-local-data-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const doImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const report = importBundle(await file.text());
      setNotice({ kind: report.readFailed ? "error" : "ok", text: `Import complete: ${reportText(report)}` });
    } catch (e) {
      setNotice({ kind: "error", text: e instanceof Error ? e.message : "Import failed" });
    }
  };

  const action = "text-[12.5px] text-ink-3 transition-colors hover:text-accent";
  return (
    <div className="pb-12">
      <header className="flex flex-col gap-2 pb-4 pt-5 sm:flex-row sm:items-start sm:justify-between lg:pt-1">
        <div>
          <h1 className="text-[24px] font-semibold leading-[1.3] text-ink">Bookmarks</h1>
          <p className="mt-1.5 text-[13px] text-ink-3">Saved locally from {SITE.name} for later reading.</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 sm:pt-1.5">
          <button type="button" onClick={() => fileRef.current?.click()} className={action}>
            Import file
          </button>
          {mounted && starred.length > 0 && (
            <button type="button" onClick={doExport} className={`${action} inline-flex items-center gap-1`}>
              <IconDownload size={13} /> Export
            </button>
          )}
          <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" onChange={(e) => doImport(e.target.files?.[0])} />
        </div>
      </header>
      <p className="rounded-tile border border-line bg-surface px-4 py-2.5 text-[12.5px] text-ink-3">Bookmarks stay in this browser. They do not sync across devices.</p>
      <Presence show={!!notice} enter="anim-notice-in" exit="anim-fade-out" duration={160}>
        <div
          role="status"
          className={`mt-3 flex items-start justify-between gap-3 rounded-tile px-4 py-2.5 text-[13px] ${notice?.kind === "ok" ? "bg-accent-soft text-accent-ink dark:text-accent" : "bg-hot-soft text-hot"}`}
        >
          {notice?.text}
          <button type="button" aria-label="Close" onClick={() => setNotice(null)} className="shrink-0 opacity-70 hover:opacity-100">
            <IconClose size={14} />
          </button>
        </div>
      </Presence>
      {!mounted ? null : starred.length === 0 ? (
        <div className="mt-3 flex flex-col items-center rounded-card border border-dashed border-line-strong px-6 py-12 text-center">
          <IconBookmark size={20} className="text-ink-4" />
          <p className="mt-3 text-[13px] text-ink-3">No bookmarks yet. Open a story and use its bookmark button.</p>
          <Link to="/" className="mt-4 text-[12.5px] font-medium text-accent hover:text-accent-ink">
            Browse latest news →
          </Link>
        </div>
      ) : (
        <ul className="mt-3 lg:space-y-3">
          {starred.map((s) => {
            const status = availability[s.id];
            const unavailable = status === "unavailable";
            return (
              <li key={s.id} className={`relative border-b border-line-soft py-4 lg:card lg:px-[18px] lg:py-[15px] ${unavailable ? "opacity-70" : "lg:card-hover"}`}>
                <div className="flex items-center gap-2 text-[12.5px] text-ink-4">
                  <span className="min-w-0 truncate text-ink-3">{shortSourceName(s.sourceName)}</span>
                  {s.publishedAt && <span className="num shrink-0">· {fullDateTime(s.publishedAt)}</span>}
                  <span className="ml-auto hidden shrink-0 sm:inline">
                    Saved <span className="num">{fullDateTime(s.savedAt)}</span>
                  </span>
                  <button type="button" aria-label="Remove bookmark" title="Remove bookmark" onClick={() => removeStar(s.id)} className="relative z-10 -my-1 ml-auto grid size-7 shrink-0 place-items-center rounded-full text-ink-4 transition-colors hover:bg-bg-sunk hover:text-ink sm:ml-0">
                    <IconClose size={14} />
                  </button>
                </div>
                <h2 className="mt-1.5 text-[16px] font-[650] leading-[1.55] text-ink">
                  {unavailable ? (
                    displayTitle(s.title, s.sourceName)
                  ) : (
                    <Link to={`/items/${s.id}`} className="transition-colors after:absolute after:inset-0 after:content-[''] hover:text-accent">
                      {displayTitle(s.title, s.sourceName)}
                    </Link>
                  )}
                </h2>
                {s.summary && <p className="mt-1.5 line-clamp-2 text-[14px] leading-[1.75] text-ink-3">{s.summary}</p>}
                {unavailable && <p className="mt-2 text-[12.5px] text-hot">This story is unavailable. Its bookmark remains until removed.</p>}
                {status === "summary-only" && <p className="mt-2 text-[12.5px] text-amber-ink">This story provides a summary only.</p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
