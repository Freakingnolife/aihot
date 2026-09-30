import { Link, useLocation } from "react-router";
import { TABBAR, tabIsActive, navHref } from "./nav";
import { useChangelogDot } from "./Sidebar";

/** Bottom tab bar of the mobile shell (up to 960px), as on the original site. */
export function MobileTabBar({ changelogVersion }: { changelogVersion: string | null }) {
  const { pathname, search } = useLocation();
  const dot = useChangelogDot(changelogVersion);
  return (
    <nav aria-label="Mobile navigation" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <div className="mx-auto grid min-h-[54px] max-w-[640px] grid-cols-4">
        {TABBAR.map((t) => {
          const active = tabIsActive(t, pathname, search);
          const Icon = t.icon;
          return (
            <Link
              key={t.to}
              to={navHref(t, pathname, search)}
              prefetch="intent"
              aria-current={active ? "page" : undefined}
              className={`relative flex min-w-0 flex-col items-center justify-center gap-[3px] px-1 py-2 text-[11px] transition-colors ${active ? "font-semibold text-accent" : "text-ink-3 active:text-ink"}`}
            >
              <Icon size={21} />
              <span className="max-w-full text-center leading-tight [overflow-wrap:anywhere]">{t.label}</span>
              {dot && t.changelog && <span className="absolute right-[calc(50%-17px)] top-2 size-1.5 rounded-full bg-hot" aria-label="New updates" />}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
