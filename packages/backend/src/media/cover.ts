// Which of an article's stored pictures fronts its card: the first one that is not page furniture
// (emoji, tracking pixels, logos and icons, animated GIFs, SVG marks, small thumbnails).
const FURNITURE_HOSTS = /(^|\.)(s\.w\.org|gravatar\.com)$/i;
const FURNITURE_NAME = /(^|[/_.-])(logo|icon|avatar|favicon|sprite|badge|emoji|pixel|spacer|tracking)([/_.-]|$)/i;
const MIN_SIDE = 300;

function usable(raw: string): string | null {
  const url = raw.replaceAll('&amp;', '&');
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
