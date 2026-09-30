import { beijingDate, beijingTime } from "@aihot/contracts/time";

export { beijingDate, beijingTime };
export const beijingWeekday = (date: string) => new Intl.DateTimeFormat("en", { weekday: "short", timeZone: "Asia/Singapore" }).format(new Date(date));

export function dayLabel(date: string, today: string): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const base = `${m}/${d}`;
  if (date === today) return `Today · ${base}`;
  const diff = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86400000);
  if (diff === 1) return `Yesterday · ${base}`;
  if (y !== Number(today.slice(0, 4))) return `${y}/${base}`;
  return base;
}

export function relativeTime(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return "Just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hours ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} days ago`;
  return beijingDate(iso);
}

export function fullDateTime(iso: string): string {
  return `${beijingDate(iso)} ${beijingTime(iso)}`;
}

/** "9月24日 10:51" (Beijing), for lists that span days. */
export function monthDayTime(iso: string): string {
  const [, m, d] = beijingDate(iso).split("-").map(Number) as [number, number, number];
  return `${m}/${d} ${beijingTime(iso)}`;
}

/** "X：Ethan Mollick (@emollick)" → "Ethan Mollick"; other sources keep their name. */
export function shortSourceName(name: string): string {
  const m = /^X[:：]\s*(.+?)\s*\(@[^)]+\)\s*$/.exec(name);
  if (m) return m[1]!.replace(/（.*?）/g, "").trim();
  return name.replace(/（RSS）|（网页）|（API）/g, "").trim();
}

export function sourceInitial(name: string): string {
  const s = shortSourceName(name).replace(/^[^\p{L}\p{N}]+/u, "");
  return (s[0] ?? "A").toUpperCase();
}
