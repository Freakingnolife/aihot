// Names, dates and grouping for daily, weekly and monthly reports.
import type { ReportNavigationEntry, ReportKind } from "@aihot/contracts/site";
import { beijingWeekday } from "../../lib/format";

export const KINDS: ReportKind[] = ["daily", "weekly", "monthly"];
export const KIND_PATH: Record<ReportKind, string> = { daily: "/daily", weekly: "/weekly", monthly: "/monthly" };
export const KIND_LABEL: Record<ReportKind, string> = { daily: "Daily briefing", weekly: "Weekly briefing", monthly: "Monthly briefing" };
export const KIND_SHORT: Record<ReportKind, string> = { daily: "Daily", weekly: "Weekly", monthly: "Monthly" };

export function kindFromPath(pathname: string): ReportKind {
  if (pathname.startsWith("/weekly")) return "weekly";
  if (pathname.startsWith("/monthly")) return "monthly";
  return "daily";
}

export function reportPath(kind: ReportKind, key: string): string {
  return `${KIND_PATH[kind]}/${key}`;
}

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** Monday and Sunday (YYYY-MM-DD) of an ISO week key such as 2026-W38. */
export function isoWeekRange(key: string): [string, string] {
  const [y, w] = key.split("-W").map(Number) as [number, number];
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const monday = new Date(jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 86400000 + (w - 1) * 7 * 86400000);
  return [ymd(monday), ymd(new Date(monday.getTime() + 6 * 86400000))];
}

/** First and last day of a month key such as 2026-08. */
export function monthRange(key: string): [string, string] {
  const [y, m] = key.split("-").map(Number) as [number, number];
  return [`${key}-01`, ymd(new Date(Date.UTC(y, m, 0)))];
}

/** "这一天的 4 件 AI 大事" / "本周的 12 件 AI 大事" / "8 月的 20 件 AI 大事". */
export function headline(kind: ReportKind, key: string, count: number): string {
  if (kind === "daily") return `${count} stories for this day`;
  if (kind === "weekly") return `${count} stories for this week`;
  return `${count} stories for ${key}`;
}

/** "09.16" for a story inside a week or month. */
export function shortDay(iso: string): string {
  const d = new Date(Date.parse(iso) + 8 * 3600000);
  return `${pad(d.getUTCMonth() + 1)}.${pad(d.getUTCDate())}`;
}

/** Month-day label of a daily key: "9月26日". */
export function dayLabel(key: string): string {
  return key.slice(5);
}


export interface ArchiveGroup {
  id: string;
  label: string;
  entries: Array<ReportNavigationEntry & { short: string }>;
}

/**
 * The archive column: days grouped by month, weeks by the month their Monday falls in ("第2周"),
 * months by year. Newest first, as the index comes.
 */
export function archiveGroups(kind: ReportKind, index: ReportNavigationEntry[]): ArchiveGroup[] {
  const groups: ArchiveGroup[] = [];
  const push = (id: string, label: string, e: ReportNavigationEntry & { short: string }) => {
    const g = groups[groups.length - 1];
    if (g && g.id === id) g.entries.push(e);
    else groups.push({ id, label, entries: [e] });
  };
  if (kind === "weekly") {
    const byMonth = new Map<string, string[]>();
    for (const e of index) {
      const m = isoWeekRange(e.key)[0].slice(0, 7);
      byMonth.set(m, [...(byMonth.get(m) ?? []), e.key]);
    }
    for (const e of index) {
      const m = isoWeekRange(e.key)[0].slice(0, 7);
      const weeks = [...byMonth.get(m)!].sort();
      push(m, m, { ...e, short: `Week ${weeks.indexOf(e.key) + 1}` });
    }
    return groups;
  }
  for (const e of index) {
    if (kind === "daily") push(e.key.slice(0, 7), e.key.slice(0, 7), { ...e, short: e.key.slice(8, 10) });
    else push(e.key.slice(0, 4), e.key.slice(0, 4), { ...e, short: e.key.slice(5, 7) });
  }
  return groups;
}

/** An issue's mark in the archive column: a large number over a small word (a month's number stands alone). */
export function archiveMark(kind: ReportKind, key: string): { big: string; small: string | null } {
  if (kind === "daily") return { big: key.slice(8, 10), small: beijingWeekday(key) };
  if (kind === "weekly") {
    const start = isoWeekRange(key)[0];
    return { big: key.slice(6), small: `From ${start.slice(5)}` };
  }
  return { big: key.slice(5, 7), small: null };
}

/** Short chip label for the phone switcher: "Today", "9月26日", "9月第2周", "8 月". */
export function chipLabel(kind: ReportKind, key: string, index: ReportNavigationEntry[], today: string): string {
  if (kind === "daily") return key === today ? "Today" : dayLabel(key);
  if (kind === "monthly") return key.slice(0, 7);
  const group = archiveGroups("weekly", index).find((g) => g.entries.some((e) => e.key === key));
  const entry = group?.entries.find((e) => e.key === key);
  return group && entry ? `${group.id} ${entry.short}` : key;
}

/** "第 N  issues": the issue's place in its series, counted from the first report that exists. */
export function issueNumber(index: ReportNavigationEntry[], key: string): number | null {
  const at = index.findIndex((e) => e.key === key);
  return at < 0 ? null : index.length - at;
}

/** The masthead's date block: a large figure and two small lines beside it. */
export function dateMark(kind: ReportKind, key: string): { figure: string; top: string; bottom: string } {
  if (kind === "daily") return { figure: key.slice(8, 10), top: key.slice(0, 7), bottom: beijingWeekday(key) };
  if (kind === "weekly") {
    const [a, b] = isoWeekRange(key);
    return { figure: key.slice(6), top: `${key.slice(0, 4)} Week ${Number(key.slice(6))}`, bottom: `${a.slice(5).replace("-", ".")} — ${b.slice(5).replace("-", ".")}` };
  }
  return { figure: key.slice(5, 7), top: key.slice(0, 4), bottom: key.slice(0, 7) };
}

/** When each kind comes out (F10), for the masthead. */
export const EDITION: Record<ReportKind, string> = { daily: "Private archive · no schedule", weekly: "Private archive · no schedule", monthly: "Private archive · no schedule" };

/** The masthead's figures, in the order a reader wants them; zero model releases is left out. */
const METRICS: Array<[key: string, unit: string]> = [
  ["totalEvents", " stories"],
  ["totalStories", " stories"],
  ["sourcesCount", " sources"],
  ["firstPartyEvents", " first-party releases"],
  ["modelsReleased", " model releases"],
  ["selectedCount", " featured stories"],
  ["reportsCovered", " briefings"],
];
export function metricItems(metrics: Record<string, number>): Array<{ value: number; unit: string }> {
  return METRICS.filter(([k]) => typeof metrics[k] === "number" && (k !== "modelsReleased" || metrics[k]! > 0)).map(([k, unit]) => ({ value: metrics[k]!, unit }));
}

/** "前一日 · 9月25日", "上一 issues · 第 37 周", "下一 issues · 7 月". */
export function neighbourLabel(kind: ReportKind, key: string, direction: "prev" | "next"): string {
  if (kind === "daily") return `${direction === "prev" ? "Previous day" : "Next day"} · ${dayLabel(key)}`;
  const which = direction === "prev" ? "Previous issue" : "Next issue";
  return kind === "weekly" ? `${which} · Week ${Number(key.slice(6))}` : `${which} · ${key}`;
}

/** Numeric page label. */
export function cnNumber(n: number): string { return String(n); }

/** The line above the nameplate: "2026 年 9 月 26 日 · 星 issues六", "2026 年第 38 周 · 09.14 — 09.20", "2026 年 8 月". */
export function dateLine(kind: ReportKind, key: string): string {
  const m = dateMark(kind, key);
  if (kind === "daily") return `${key} · ${m.bottom}`;
  return kind === "weekly" ? `${m.top} · ${m.bottom}` : `${m.top} ${m.bottom}`;
}

/** What each kind is, under its nameplate. */
export const MOTTO: Record<ReportKind, string> = { daily: "Additive manufacturing · Daily archive", weekly: "Additive manufacturing · Weekly archive", monthly: "Additive manufacturing · Monthly archive" };

export interface PeriodCell {
  key: string | null;
  /** Hover text: "9月26日 · 第 158  issues". */
  label: string;
  state: "current" | "issue" | "none" | "pad";
}

/** ISO week number of a date (YYYY-MM-DD). */
function isoWeek(day: string): number {
  const d = new Date(`${day}T00:00:00Z`);
  const thursday = new Date(d.getTime() + (3 - ((d.getUTCDay() + 6) % 7)) * 86400000);
  const jan1 = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  return Math.floor((thursday.getTime() - jan1.getTime()) / 86400000 / 7) + 1;
}

/**
 * The dot grid beside the date in the masthead: the days of this issue's month (dailies, Monday first),
 * the weeks of its year (weeklies) or the months of its year (monthlies), each marked as this issue,
 * an issue that exists, or none.
 */
export function periodGrid(kind: ReportKind, key: string, index: ReportNavigationEntry[]): { title: string; note: string; columns: number; heads: string[] | null; cells: PeriodCell[] } {
  const exists = new Set(index.map((e) => e.key));
  const cell = (k: string, name: string): PeriodCell => {
    const n = issueNumber(index, k);
    return { key: k, label: n ? `${name} · Issue ${n}` : `${name} · No issue`, state: k === key ? "current" : exists.has(k) ? "issue" : "none" };
  };
  const count = (cells: PeriodCell[]) => cells.filter((c) => c.state === "issue" || c.state === "current").length;
  const year = key.slice(0, 4);
  if (kind === "daily") {
    const m = Number(key.slice(5, 7));
    const days = new Date(Date.UTC(Number(year), m, 0)).getUTCDate();
    const lead = (new Date(Date.UTC(Number(year), m - 1, 1)).getUTCDay() + 6) % 7;
    const cells: PeriodCell[] = [
      ...Array.from({ length: lead }, (): PeriodCell => ({ key: null, label: "", state: "pad" })),
      ...Array.from({ length: days }, (_, i) => cell(`${key.slice(0, 7)}-${pad(i + 1)}`, `${m}/${i + 1}`)),
    ];
    return { title: `${year}-${pad(m)}`, note: `${count(cells)} issues this month`, columns: 7, heads: ["M", "T", "W", "T", "F", "S", "S"], cells };
  }
  if (kind === "weekly") {
    const weeks = isoWeek(`${year}-12-28`);
    const cells = Array.from({ length: weeks }, (_, i) => {
      const k = `${year}-W${pad(i + 1)}`;
      const [a, b] = isoWeekRange(k);
      return cell(k, `Week ${i + 1}: ${a} to ${b}`);
    });
    return { title: year, note: `${count(cells)} issues this year`, columns: 13, heads: null, cells };
  }
  const cells = Array.from({ length: 12 }, (_, i) => cell(`${year}-${pad(i + 1)}`, `${year}-${pad(i + 1)}`));
  return { title: year, note: `${count(cells)} issues this year`, columns: 6, heads: null, cells };
}
