/** Bounded visual cues from a story's own tags and acronyms (at most two). Never rewrites the text. */
export function scanText(text: string, tags: string[] = []): { text: string; emphasis: boolean }[] {
  const phrases = tags.filter((tag) => tag.length >= 3).sort((a, b) => b.length - a.length);
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const known = new Set(phrases.map((phrase) => phrase.toLowerCase()));
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(?:${[...phrases.map(escape), "[A-Z][A-Z0-9-]{1,}"].join("|")})(?![\\p{L}\\p{N}])`, "giu");
  const parts: { text: string; emphasis: boolean }[] = [];
  let cursor = 0;
  let emphasized = 0;
  const seen = new Set<string>();
  for (const match of text.matchAll(pattern)) {
    if (!known.has(match[0].toLowerCase()) && match[0] !== match[0].toUpperCase()) continue;
    if (seen.has(match[0].toLowerCase()) || (match[0] === "US" && text[match.index + 2] === "$")) continue;
    if (emphasized === 2) break;
    const at = match.index;
    if (at > cursor) parts.push({ text: text.slice(cursor, at), emphasis: false });
    parts.push({ text: match[0], emphasis: true });
    cursor = at + match[0].length;
    emphasized += 1;
    seen.add(match[0].toLowerCase());
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), emphasis: false });
  return parts;
}
