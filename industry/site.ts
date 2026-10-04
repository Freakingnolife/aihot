export const SITE = {
  name: "AdditiveOS Radar", subject: "AM", homeTitle: "AdditiveOS Radar — Additive manufacturing news",
  description: "Attributed additive manufacturing news for professionals who use and evaluate 3D printing. Summaries of publisher reports, not validated engineering advice.",
  tagline: "What changed in additive manufacturing", locale: "en", defaultUrl: "http://127.0.0.1:4310",
  mcpPrefix: "additiveos_radar", contactEmail: null as string | null,
  footerNote: "Attributed publisher reports · Not validated engineering advice", icp: null as string | null,
  organization: { name: "AdditiveOS Radar", founder: null as null | { name: string; url?: string; description?: string } },
  crawlerName: "AdditiveOS-Radar",
} as const;
export const ABOUT = {
  kicker: "About AdditiveOS Radar", headline: ["Additive manufacturing changes.", "Follow the original sources."] as [string, string],
  lead: "AI-written summaries of additive manufacturing news from {sources} sources, with each publisher credited and linked. Collection failures and coverage gaps are recorded separately; listing a source does not verify its claims.",
  steps: { collect: "Sources are collected twice a day, at 07:00 and 19:00 Singapore time, from their RSS feeds and news pages.", store: "Original publication dates are retained. Repeated announcements are not independent corroboration.", select: "AI relevance filtering and summaries. Two passes of one model are not independent factual review.", publish: "English stories only: a summary, the publisher credited and a link to the original." },
  maker: null as null | { name: string; greeting: string[]; avatarSourceId?: string | null; wechat?: { title: string; note: string }; feishu?: { title: string; note: string } },
  copyright: "Publisher rights remain with each source. For corrections, use the ",
} as const;
export function withSubject(noun: string): string { return `${SITE.subject} ${noun}`; }
