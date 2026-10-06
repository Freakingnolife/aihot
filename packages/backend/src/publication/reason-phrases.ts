// The key phrases a "Why it matters" sentence shows in bold. One pure rule shared by the analysis that
// receives them from the model, publishing (which checks them against the final text, manual overrides
// included) and the backfill, so a phrase never reaches a reader unless it is words of the sentence itself.
const MAX_PHRASES = 2;
const MIN_WORDS = 2;
const MAX_WORDS = 4;
const WORD_CHAR = /[\p{L}\p{N}]/u;

/**
 * The phrases that may be bold in `reason`: each an exact, case-sensitive run of whole words of the text,
 * 2–4 words long, different from and not overlapping an earlier one; at most two. Anything else is dropped, never repaired.
 */
export function validReasonPhrases(reason: string | null | undefined, candidates: unknown): string[] {
  if (!reason || !Array.isArray(candidates)) return [];
  const kept: string[] = [];
  const taken: Array<[number, number]> = [];
  for (const candidate of candidates) {
    if (kept.length === MAX_PHRASES) break;
    if (typeof candidate !== "string") continue;
    const phrase = candidate.trim();
    const words = phrase.split(/\s+/).length;
    if (!phrase || words < MIN_WORDS || words > MAX_WORDS || kept.includes(phrase)) continue;
    const at = wholeWordIndex(reason, phrase, taken);
    if (at < 0) continue;
    kept.push(phrase);
    taken.push([at, at + phrase.length]);
  }
  return kept;
}

/** First place `phrase` stands in `text` as whole words and clear of the ranges already taken; -1 if none. */
function wholeWordIndex(text: string, phrase: string, taken: Array<[number, number]>): number {
  for (let at = text.indexOf(phrase); at >= 0; at = text.indexOf(phrase, at + 1)) {
    const end = at + phrase.length;
    const before = text[at - 1];
    const after = text[end];
    if (before && WORD_CHAR.test(before) && WORD_CHAR.test(phrase[0]!)) continue;
    if (after && WORD_CHAR.test(after) && WORD_CHAR.test(phrase[phrase.length - 1]!)) continue;
    if (taken.some(([from, to]) => at < to && end > from)) continue;
    return at;
  }
  return -1;
}
