import { SITE } from "@aihot/industry/site";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { useChangelogSeen } from "../../lib/local-state";
import { SIDEBAR, tabIsActive, navHref } from "./nav";

/** True while the changelog has an entry newer than the one this reader last opened. */
export function useChangelogDot(latestVersion: string | null): boolean {
  const seen = useChangelogSeen();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || !latestVersion) return false;
  return !seen || seen < latestVersion;
}

/** The news pages, in a row under the shared header; phones use the tab bar below instead. */
const READING = SIDEBAR[0]!.items;

/**
 * The AdditiveOS header, identical to the one on the Advisor page (/advisor, the landing service): same
 * height, padding, wordmark, 12px links and waitlist button. Keep the two in step when either changes.
 */
function SiteHeader() {
  return (
    <div className="flex h-20 items-center justify-between bg-bg px-[6%] min-[901px]:h-[100px] min-[901px]:px-[4.5%]">
      <a href="/" className="text-[21px] font-bold tracking-[-1px] text-ink min-[901px]:text-[24px]" aria-label="AdditiveOS home">
        Additive<span className="text-accent">OS</span>
      </a>
      <nav aria-label="Main" className="flex items-center gap-[38px] text-[12px]">
        <a href="/" aria-current="page" className="hidden font-semibold min-[901px]:inline">News</a>
        <a href="/advisor" className="hidden min-[901px]:inline">Advisor</a>
        <a href="/advisor#join" className="inline-flex min-h-10 items-center justify-between gap-[15px] whitespace-nowrap rounded-full bg-accent px-4 text-[11px] font-semibold text-[#fffdf7] transition-colors hover:bg-ink min-[901px]:min-h-[46px] min-[901px]:gap-[30px] min-[901px]:px-[23px] min-[901px]:text-[12px]">
          Join the waitlist <span aria-hidden="true" className="text-[22px] leading-none">↗</span>
        </a>
      </nav>
    </div>
  );
}

/** Shared header, then the news sections and the pilot notice. It scrolls away with the page. */
export function Masthead() {
  const { pathname, search } = useLocation();
  return (
    <header>
      <SiteHeader />
      <div className="px-[6%] min-[901px]:px-[4.5%]">
        <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-2 border-b border-line pb-3 lg:pb-0">
          <nav aria-label="News sections" className="hidden items-center gap-7 text-[12px] lg:flex">
            {READING.map((item) => {
              const active = tabIsActive(item, pathname, search);
              return (
                <Link
                  key={item.to}
                  to={navHref(item, pathname, search)}
                  prefetch="intent"
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex h-11 items-center border-b transition-colors ${active ? "border-ink font-semibold text-ink" : "border-transparent text-ink-3 hover:text-ink"}`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <p className="text-[12px] leading-[1.35] text-ink-3">
            <strong className="font-semibold text-ink">Private draft pilot.</strong> Attributed publisher reports, not validated engineering advice.
          </p>
        </div>
      </div>
    </header>
  );
}

/** About, API and the rest of the "More" pages, at the foot of every page on desktop. */
export function SiteFooter() {
  const links = SIDEBAR.at(-1)!.items;
  return (
    <footer className="hidden px-[4.5%] lg:block">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line py-6 text-[13px] text-ink-3">
        <span className="font-semibold text-ink">{SITE.name}</span>
        {links.map((item) => (
          <Link key={item.to} to={item.to} className="hover:text-ink">
            {item.label}
          </Link>
        ))}
        {SITE.icp && (
          <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer" className="ml-auto text-[11px] text-ink-4 hover:text-ink-3">
            {SITE.icp}
          </a>
        )}
      </div>
    </footer>
  );
}
