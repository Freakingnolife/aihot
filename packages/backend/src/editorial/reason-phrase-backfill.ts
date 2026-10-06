// Key phrases for "Why it matters" sentences written before the understanding step returned them: one
// small request per featured story, then the story is published again so readers get a new revision.
// Nothing else is touched: the sentence, title, summary, score and selection stay as they were.
import { z } from "zod";
import { sql, type Tx } from "../db.ts";
import { chatJson } from "../providers/llm.ts";
import { completeReceipt } from "../providers/receipts.ts";
import { publishArticleTx } from "../publication/publish.ts";
import { validReasonPhrases } from "../publication/reason-phrases.ts";
import { modelFor } from "./models.ts";
import { promptText, promptVersion } from "./prompts.ts";

const SYSTEM = promptText("reason-phrases");
const VERSION = promptVersion("reason-phrases");
const Schema = z.object({ keyPhrases: z.array(z.string()).max(8).catch([]) });

export interface PhraseCandidate {
  articleId: string;
  /** The latest judgement of the article: the one publishing reads. */
  analysisId: number;
  reason: string;
}

/** Public selected stories of the last `days` days with a sentence and no key phrases yet, strongest first
 * (the order the front page picks its top stories in), so a small --limit covers what readers see. */
export async function phraseCandidates(days: number, limit: number): Promise<PhraseCandidate[]> {
  return sql<PhraseCandidate[]>`
    SELECT p.article_id AS "articleId", an.id AS "analysisId", p.reason
    FROM publications p
    JOIN LATERAL (SELECT id FROM analyses WHERE article_id = p.article_id ORDER BY input_revision DESC, id DESC LIMIT 1) an ON true
    WHERE p.selected AND p.visibility = 'public' AND coalesce(p.reason, '') <> '' AND cardinality(p.reason_phrases) = 0
      AND p.timeline_at >= now() - make_interval(days => ${days})
    ORDER BY p.score DESC NULLS LAST, p.timeline_at DESC
    LIMIT ${limit}`;
}

/** Asks for the phrases of one sentence (a paid request through the receipts and budget), keeping only the valid ones. */
export async function requestPhrases(c: PhraseCandidate): Promise<{ phrases: string[]; receiptId: number }> {
  const res = await chatJson({
    model: await modelFor("understand"), purpose: "reason_phrases", subject: `article:${c.articleId}`, promptVersion: VERSION,
    system: SYSTEM, user: c.reason, schema: Schema, temperature: 0, maxTokens: 300,
  });
  return { phrases: validReasonPhrases(c.reason, res.data.keyPhrases), receiptId: res.receiptId };
}

/** Stores the phrases with the article's latest judgement and publishes the article again, in one transaction. */
export async function applyPhrases(c: PhraseCandidate, phrases: string[], receiptId: number): Promise<{ changed: boolean }> {
  return sql.begin(async (tx: Tx) => {
    if (phrases.length > 0) {
      await tx`UPDATE analyses SET output = coalesce(output, '{}'::jsonb) || ${tx.json({ reasonPhrases: phrases } as never)} WHERE id = ${c.analysisId}`;
    }
    await completeReceipt(tx, receiptId);
    const result = phrases.length > 0 ? await publishArticleTx(tx, c.articleId) : null;
    return { changed: result?.changed ?? false };
  });
}
