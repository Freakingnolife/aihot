// Key phrases for the "Why it matters" sentences of stories already featured in the last 7 days.
//
//   node --env-file=.env scripts/backfill-reason-phrases.ts --dry-run          list the stories, send nothing
//   node --env-file=.env scripts/backfill-reason-phrases.ts [--limit 40]       one request per story
//   node --env-file=.env scripts/backfill-reason-phrases.ts --ids a,b,c        only these stories (e.g. the current top stories)
//
// Paid requests go through the receipts and the budget (purpose reason_phrases); a repeat run reuses
// answers already received. It stops cleanly when the budget or the provider says stop, and needs
// MODEL_CALLS_ENABLED=true. Only the key phrases and the revision of a story change.
import { parseArgs } from "node:util";
import { config } from "@aihot/backend/config";
import { closeDb } from "@aihot/backend/db";
import { applyPhrases, phraseCandidates, requestPhrases } from "@aihot/backend/editorial/reason-phrase-backfill";
import { BudgetExceededError, ReceiptBusyError, ReceiptUnknownError } from "@aihot/backend/providers/receipts";

const DAYS = 7;
const MAX_CONSECUTIVE_ERRORS = 3;
const { values } = parseArgs({ options: { "dry-run": { type: "boolean", default: false }, limit: { type: "string", default: "100" }, ids: { type: "string" } } });
const limit = Number.parseInt(values.limit!, 10);
if (!Number.isInteger(limit) || limit < 1) throw new Error("--limit must be a positive number");
const ids = values.ids?.split(",").map((id) => id.trim()).filter(Boolean);

let stopping = false;
process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });

const out = { candidates: 0, requested: 0, written: 0, noPhrases: 0, errors: 0, stop: "finished" };
try {
  const candidates = ids
    ? (await phraseCandidates(DAYS, 10_000)).filter((c) => ids.includes(c.articleId)).slice(0, limit)
    : await phraseCandidates(DAYS, limit);
  out.candidates = candidates.length;
  if (values["dry-run"]) {
    for (const c of candidates) console.log(`${c.articleId}  ${c.reason}`);
    out.stop = "dry-run";
  } else if (!config.modelCallsEnabled) {
    out.stop = "model-calls-disabled";
  } else {
    let consecutive = 0;
    for (const c of candidates) {
      if (stopping) { out.stop = "shutdown"; break; }
      try {
        out.requested += 1;
        const { phrases, receiptId } = await requestPhrases(c);
        await applyPhrases(c, phrases, receiptId);
        if (phrases.length > 0) out.written += 1; else out.noPhrases += 1;
        console.log(`${c.articleId}  ${phrases.length ? phrases.map((p) => `[${p}]`).join(" ") : "(none valid)"}`);
        consecutive = 0;
      } catch (error) {
        out.errors += 1;
        console.log(`${c.articleId}  error: ${String(error).slice(0, 200)}`);
        if (error instanceof BudgetExceededError) { out.stop = "budget"; break; }
        if (error instanceof ReceiptUnknownError || error instanceof ReceiptBusyError) { out.stop = "receipt"; break; }
        if (/usage limit|429|rate.?limit/i.test(String(error))) { out.stop = "provider-limit"; break; }
        if (++consecutive >= MAX_CONSECUTIVE_ERRORS) { out.stop = "errors"; break; }
      }
    }
  }
} finally {
  console.log(JSON.stringify(out));
  await closeDb();
}
