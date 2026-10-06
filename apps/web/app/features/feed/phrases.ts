/**
 * Splits `text` so the given phrases come out as their own bold parts. A phrase counts only where it stands in
 * the text exactly (case-sensitive) and clear of an earlier one; anything else is ignored. Joining the parts
 * always gives back `text`. (A response cached by an older page has no phrases: the default covers it.)
 */
export function splitByPhrases(text: string, phrases: string[] = []): { text: string; bold: boolean }[] {
  const spans: [number, number][] = [];
  for (const phrase of phrases) {
    const at = phrase ? text.indexOf(phrase) : -1;
    if (at < 0 || spans.some(([from, to]) => at < to && at + phrase.length > from)) continue;
    spans.push([at, at + phrase.length]);
  }
  const parts: { text: string; bold: boolean }[] = [];
  let cursor = 0;
  for (const [from, to] of spans.sort((a, b) => a[0] - b[0])) {
    if (from > cursor) parts.push({ text: text.slice(cursor, from), bold: false });
    parts.push({ text: text.slice(from, to), bold: true });
    cursor = to;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), bold: false });
  return parts;
}
