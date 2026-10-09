import { PROXYABLE_URL } from "./imgproxy.ts";

// Which of an article's stored pictures fronts its card: the first one that is not page furniture
// (emoji, tracking pixels, logos and icons, animated GIFs, SVG marks, small thumbnails).
const FURNITURE_HOSTS = /(^|\.)(s\.w\.org|gravatar\.com)$/i;
const FURNITURE_NAME = /(^|[/_.-])(logo|icon|avatar|favicon|sprite|badge|emoji|pixel|spacer|tracking)([/_.-]|$)/i;
const MIN_SIDE = 300;
const LEAD_NAME = /logo|badge|certificat|screenshot|screen[-_ ]?shot|zrzut[-_ ]?ekranu|certificate|watermark/i;

function usable(raw: string): string | null {
  const url = raw.replaceAll('&amp;', '&');
  // new URL() repairs some malformed strings ("https:/host/x.jpg"); the proxy would still reject them, so check the string first.
  if (!PROXYABLE_URL.test(url)) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(parsed.protocol) || FURNITURE_HOSTS.test(parsed.hostname)) return null;
  if (/\.(svg|gif)$/i.test(parsed.pathname) || /[?&]bvt=/.test(parsed.search) || FURNITURE_NAME.test(parsed.pathname)) return null;
  // A size in the file name ("_240x240", "-150x150") is the picture's real size; a shop or CMS thumbnail is too small for a cover.
  const size = /[_-](\d{2,4})x(\d{2,4})\.[a-z]+$/i.exec(parsed.pathname);
  if (size && Math.min(Number(size[1]), Number(size[2])) < MIN_SIDE) return null;
  return url;
}

export function pickCoverImage(media: unknown): string | null {
  if (!Array.isArray(media)) return null;
  for (const m of media) {
    if (!m || typeof m !== 'object' || (m as { kind?: unknown }).kind !== 'image') continue;
    const url = (m as { url?: unknown }).url;
    const picked = typeof url === 'string' ? usable(url) : null;
    if (picked) return picked;
  }
  return null;
}

export type LeadSuitability = "good" | "unknown" | "bad";

export function coverDetails(media: unknown, url: unknown): { width: number | null; height: number | null; leadSuitability: LeadSuitability } {
  const normalizedUrl = typeof url === "string" ? url.replaceAll("&amp;", "&") : "";
  const image = Array.isArray(media) ? media.find((m) => m && typeof m === "object" && (m as { kind?: unknown }).kind === "image" && typeof (m as { url?: unknown }).url === "string" && (m as { url: string }).url.replaceAll("&amp;", "&") === normalizedUrl) as { width?: unknown; height?: unknown } | undefined : undefined;
  const width = typeof image?.width === "number" ? image.width : null;
  const height = typeof image?.height === "number" ? image.height : null;
  const normalized = usable(normalizedUrl);
  if (!normalized) return { width, height, leadSuitability: "bad" };
  const parsed = new URL(normalized);
  const ratio = width && height ? width / height : null;
  const hintedSize = /[_-](\d{2,4})x(\d{2,4})\.[a-z]+$/i.exec(parsed.pathname);
  const naturalWidth = width ?? (hintedSize ? Number(hintedSize[1]) : null);
  const naturalHeight = height ?? (hintedSize ? Number(hintedSize[2]) : null);
  const naturalRatio = ratio ?? (naturalWidth && naturalHeight ? naturalWidth / naturalHeight : null);
  const hasBadName = LEAD_NAME.test(parsed.pathname);
  const undersized = (naturalWidth !== null && naturalWidth < 720) || (naturalHeight !== null && naturalHeight < 400);
  const knownSize = naturalWidth !== null && naturalHeight !== null;
  const largeEnough = knownSize && !undersized;
  const landscape = naturalRatio !== null && naturalRatio >= 1.3 && naturalRatio <= 2.2;
  const leadSuitability: LeadSuitability = hasBadName || undersized || (knownSize && (!largeEnough || !landscape)) ? "bad" : knownSize ? "good" : "unknown";
  return { width, height, leadSuitability };
}
