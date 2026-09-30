// Site navigation, one place for the desktop sidebar, the mobile tab bar and the mobile "More" page.
import { withSubject } from "@aihot/industry/site";
import { hrefWith } from "../../features/feed/Filters";
import { FEATURES } from "@aihot/industry/features";
import type { ReactNode } from "react";
import {
  IconApps, IconBolt, IconBookmark, IconChart, IconDoc, IconFlame, IconGrid, IconHeart, IconHistory, IconList, IconMessage, IconPlug,
} from "../icons";

export interface NavItem {
  to: string;
  label: string;
  icon: (p: { size?: number }) => ReactNode;
  /** Match the path exactly (the home page). */
  end?: boolean;
  /** Shows the unread dot while the changelog has news. */
  changelog?: boolean;
}

export const SIDEBAR: Array<{ title: string; items: NavItem[] }> = [
  {
    title: "Reading",
    items: [
      { to: "/all", label: "Recent", icon: IconBolt, end: true },
      { to: "/all?mode=archive", label: "Archive", icon: IconList },
      { to: "/hot", label: "Trending", icon: IconFlame },
      { to: "/daily", label: withSubject("briefings"), icon: IconDoc },
      { to: "/topics", label: "Topics", icon: IconGrid },
      { to: "/starred", label: "Bookmarks", icon: IconBookmark },
    ],
  },
  // The optional AI-only modules (industry/features.ts).
  ...(FEATURES.leaderboard || FEATURES.codexResetMonitor
    ? [
        {
          title: "模型",
          items: [
            ...(FEATURES.leaderboard ? [{ to: "/leaderboard", label: "模型榜", icon: IconChart }] : []),
            ...(FEATURES.codexResetMonitor ? [{ to: "/codex-reset", label: "Tibo重置监控", icon: IconHistory }] : []),
          ],
        },
      ]
    : []),
  {
    title: "More",
    items: [
      { to: "/agent", label: "API & MCP", icon: IconPlug },
      { to: "/about", label: "About", icon: IconHeart },
      { to: "/changelog", label: "Changes", icon: IconHistory, changelog: true },
      { to: "/feedback", label: "Feedback", icon: IconMessage },
    ],
  },
];

export const TABBAR: NavItem[] = [
  { to: "/all", label: "Recent", icon: IconBolt, end: true },
  { to: "/all?mode=archive", label: "Archive", icon: IconList },
  { to: "/daily", label: "Briefings", icon: IconDoc },
  { to: "/more", label: "More", icon: IconApps, changelog: true },
];

/** Pages reached from the mobile "More" tab keep that tab highlighted. */
export const MORE_PATHS = ["/more", "/hot", "/topics", "/starred", "/leaderboard", "/codex-reset", "/agent", "/about", "/changelog", "/feedback", "/terms", "/privacy"];

export function tabIsActive(item: NavItem, pathname: string, search = ""): boolean {
  if (item.to.startsWith("/all")) return pathname === "/all" && (new URLSearchParams(search).get("mode") === "archive") === item.to.includes("mode=archive");
  if (item.end) return pathname === item.to;
  if (item.to === "/more") return MORE_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (item.to === "/daily") return /^\/(daily|weekly|monthly)(\/|$)/.test(pathname);
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

/** Period switches retain the current pool filters; entering from elsewhere starts fresh. */
export function navHref(item: NavItem, pathname: string, search: string): string {
  if (pathname !== "/all" || !item.to.startsWith("/all")) return item.to;
  return hrefWith("/all", new URLSearchParams(search), { mode: item.to.includes("mode=archive") ? "archive" : "recent" });
}
