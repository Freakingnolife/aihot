import { titled } from "./lib/seo";
import { SITE } from "@aihot/industry/site";
import {
  isRouteErrorResponse, Link, Links, Meta, Outlet, Scripts, ScrollRestoration, useLoaderData, useLocation, useNavigation, useRouteError, useRouteLoaderData,
  type ShouldRevalidateFunction,
} from "react-router";
import type { ReactNode } from "react";
import type { Route } from "./+types/root";
import "./app.css";
import { Masthead, SiteFooter } from "./components/shell/Masthead";
import { MobileTabBar } from "./components/shell/MobileTabBar";
import { BackToTop, NavigationProgress } from "./components/shell/Chrome";
import { RingMark } from "./components/Logo";
import { buttonClass } from "./components/ui/Controls";
import { THEME_BOOT_SCRIPT } from "./lib/local-state";
import { apiGet } from "./lib/api.server";
import { useHydratedFlag } from "./lib/hydration";

export const links: Route.LinksFunction = () => [
  { rel: "icon", href: "/favicon.ico", sizes: "any" },
  { rel: "icon", type: "image/png", href: "/icon.png" },
  { rel: "apple-touch-icon", href: "/apple-icon.png" },
  { rel: "manifest", href: "/manifest.webmanifest" },
  { rel: "alternate", type: "application/rss+xml", title: `${SITE.name} — Selected`, href: "/feed.xml" },
];

interface SiteMeta {
  changelogVersion: string | null;
}

export async function loader({ request }: Route.LoaderArgs) {
  try {
    return await apiGet<SiteMeta>("/api/site/meta", { signal: request.signal });
  } catch {
    return { changelogVersion: null } satisfies SiteMeta;
  }
}

export const shouldRevalidate: ShouldRevalidateFunction = () => false;

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang={SITE.locale} suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" media="(prefers-color-scheme: light)" content="#faf9f6" />
        <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#13191c" />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <meta name="robots" content="noindex, nofollow" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration getKey={(location) => location.key} />
        <Scripts />
      </body>
    </html>
  );
}

/** Only a page nobody matched falls back to this; every page names itself. */
export function meta({ error }: Route.MetaArgs) {
  if (!error) return [];
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return [{ title: titled(notFound ? "Page not found" : "Unable to load") }, { name: "robots", content: "noindex" }];
}

/** Masthead, main column, footer and phone tab bar around a page (or an error). */
function SiteShell({ changelogVersion, children }: { changelogVersion: string | null; children: ReactNode }) {
  const navigation = useNavigation();
  return (
    <div className="flex min-h-dvh flex-col">
      <NavigationProgress active={navigation.state === "loading"} />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-control focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <Masthead />
      {/* Mobile shell (≤ 960px): one centred column, the tab bar below. Desktop: the page shares the header's
          4.5% side margins, so every row starts where the wordmark does. */}
      <main id="main" className="min-w-0 flex-1 pb-[calc(6rem+env(safe-area-inset-bottom))] lg:px-[4.5%] lg:pb-16 lg:pt-8">
        <div className="mx-auto w-full max-w-[640px] px-4 lg:max-w-none lg:px-0">{children}</div>
      </main>
      <SiteFooter />
      <MobileTabBar changelogVersion={changelogVersion} />
      <BackToTop />
    </div>
  );
}

export default function App() {
  const meta = useLoaderData<typeof loader>();
  useHydratedFlag();
  const { pathname } = useLocation();
  // The admin has its own chrome.
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return <Outlet />;
  return (
    <SiteShell changelogVersion={meta.changelogVersion}>
      <Outlet />
    </SiteShell>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const site = useRouteLoaderData<typeof loader>("root");
  const { pathname } = useLocation();
  const status = isRouteErrorResponse(error) ? error.status : 500;
  const notFound = status === 404;
  const body = (
    <div className="flex min-h-[70vh] items-center justify-center px-2 py-16">
      <div className="max-w-sm text-center">
        <RingMark className="mx-auto mb-5 size-10 text-accent" />
        <div className="mono text-[12px] text-ink-4">{status}</div>
        <h1 className="mt-1.5 text-[20px] font-bold text-ink">{notFound ? "No content here" : "Unable to load"}</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-3">
          {notFound ? "This page is unavailable." : "Please retry shortly. Previously loaded drafts remain available."}
        </p>
        <div className="mt-6 flex justify-center gap-2.5">
          <Link to="/" className={buttonClass("primary")}>
            Back to selected drafts
          </Link>
          <Link to="/all" className={buttonClass("secondary")}>
            Browse all drafts
          </Link>
        </div>
      </div>
    </div>
  );
  // Admin errors stay inside the admin's own chrome.
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return body;
  return <SiteShell changelogVersion={site?.changelogVersion ?? null}>{body}</SiteShell>;
}
