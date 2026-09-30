export const SITE = {
  name: "AdditiveOS Radar", subject: "AM", homeTitle: "AdditiveOS Radar — Private AM intelligence",
  description: "Attributed additive manufacturing news for application and service-bureau teams. Private drafts, not validated engineering advice.",
  tagline: "What changed in additive manufacturing", locale: "en", defaultUrl: "http://127.0.0.1:4310",
  mcpPrefix: "additiveos_radar", contactEmail: null as string | null,
  footerNote: "Private pilot · Publisher claims remain attributed", icp: null as string | null,
  organization: { name: "AdditiveOS Radar", founder: null as null | { name: string; url?: string; description?: string } },
  crawlerName: "AdditiveOSRadarBot",
} as const;
export const ABOUT = {
  kicker: "About AdditiveOS Radar", headline: ["Additive manufacturing changes.", "Follow the original sources."] as [string, string],
  lead: "A private pilot with {sources} configured sources. Collection failures and coverage gaps are recorded separately; configuration does not establish verification.",
  steps: { collect: "One bounded collection batch from observed RSS and news routes.", store: "Original dates and backfill status are retained. Repeated announcements are not independent corroboration.", select: "Provisional relevance scoring with unchanged thresholds. Two passes of one model are not independent factual review.", publish: "English drafts for private reading only. No scheduled collection, public release or notifications." },
  maker: null as null | { name: string; greeting: string[]; avatarSourceId?: string | null; wechat?: { title: string; note: string }; feishu?: { title: string; note: string } },
  copyright: "Publisher rights remain with each source. For corrections, use the ",
} as const;
export function withSubject(noun: string): string { return `${SITE.subject} ${noun}`; }
