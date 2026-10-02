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

/** The news pages, in the header row on desktop; phones use the tab bar below instead. */
const READING = SIDEBAR[0]!.items;

/**
 * The AdditiveOS header, one row: wordmark (the News home link) and the news sections on the left, Advisor and the
 * waitlist button on the right, a thin rule underneath. Phones keep a compact bar (wordmark and button) and the tab
 * bar. It scrolls away with the page. The Advisor page (/advisor, the landing service) keeps its own header; keep
 * the wordmark and waitlist button in step when either changes.
 */
export function Masthead() {
  const { pathname, search } = useLocation();
  return (
    <header className="px-[6%] lg:px-[4.5%]">
      <div className="flex h-20 items-center border-b border-line min-[901px]:h-[88px]">
        <a href="/" className="text-[21px] font-bold tracking-[-1px] text-ink min-[901px]:text-[24px]" aria-label="AdditiveOS News home">
          Additive<span className="text-accent">OS</span>
        </a>
        <nav aria-label="News sections" className="-mb-px ml-12 hidden gap-7 self-stretch text-[12px] lg:flex">
          {READING.map((item) => {
            const active = tabIsActive(item, pathname, search);
            return (
              <Link
                key={item.to}
                to={navHref(item, pathname, search)}
                prefetch="intent"
                aria-current={active ? "page" : undefined}
                className={`flex items-center border-b-2 transition-colors ${active ? "border-ink font-semibold text-ink" : "border-transparent text-ink-3 hover:text-ink"}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <nav aria-label="Main" className="ml-auto flex items-center gap-[38px] text-[12px]">
          <a href="/advisor" className="hidden min-[901px]:inline">Advisor</a>
          <a href="/advisor#join" className="inline-flex min-h-10 items-center justify-between gap-[15px] whitespace-nowrap rounded-full bg-accent px-4 text-[11px] font-semibold text-[#fffdf7] transition-colors hover:bg-ink min-[901px]:min-h-[46px] min-[901px]:gap-[30px] min-[901px]:px-[23px] min-[901px]:text-[12px]">
            Join the waitlist <span aria-hidden="true" className="text-[22px] leading-none">↗</span>
          </a>
        </nav>
      </div>
    </header>
  );
}

/** The pilot notice on every page; on desktop also About, API and the rest of the "More" pages. */
export function SiteFooter() {
  const links = SIDEBAR.at(-1)!.items;
  return (
    <footer className="px-[6%] pb-[calc(5rem+env(safe-area-inset-bottom))] lg:px-[4.5%] lg:pb-0">
      <div className="border-t border-line py-6 text-[13px] text-ink-3">
        <div className="hidden flex-wrap items-center gap-x-6 gap-y-2 lg:flex">
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
        <p className="text-[12px] leading-[1.35] lg:mt-3">
          <strong className="font-semibold text-ink">Private draft pilot.</strong> Attributed publisher reports, not validated engineering advice.
        </p>
      </div>
    </footer>
  );
}
