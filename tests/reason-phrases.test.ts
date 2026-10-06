// The key phrases of "Why it matters": only exact, whole-word, case-sensitive runs of the final text survive.
import assert from "node:assert/strict";
import { test } from "node:test";
import { validReasonPhrases } from "@aihot/backend/publication/reason-phrases";

const REASON = "The agreement illustrates a powder lifecycle model in which an AM manufacturer buys new powder and supplies used material back to the same producer for reprocessing.";

test("exact phrases of the text are kept, in the model's order", () => {
  assert.deepEqual(validReasonPhrases(REASON, ["powder lifecycle model", "used material"]), ["powder lifecycle model", "used material"]);
  assert.deepEqual(validReasonPhrases(REASON, ["  powder lifecycle model "]), ["powder lifecycle model"]);
});

test("a paraphrase, a different case or a phrase that is not in the text is dropped", () => {
  assert.deepEqual(validReasonPhrases(REASON, ["powder life-cycle model", "Powder lifecycle model", "closed loop recycling", "powder model"]), []);
});

test("a phrase must be whole words, not the middle of a longer word", () => {
  assert.deepEqual(validReasonPhrases(REASON, ["powder life", "wder lifecycle"]), []);
  assert.deepEqual(validReasonPhrases("Open powder lifecycles help.", ["powder lifecycle"]), []);
});

test("one word, or more than four, is dropped", () => {
  assert.deepEqual(validReasonPhrases(REASON, ["powder", "AM", "manufacturer buys new powder and"]), []);
  assert.deepEqual(validReasonPhrases(REASON, ["manufacturer buys new powder"]), ["manufacturer buys new powder"]);
});

test("overlapping or repeated phrases keep only the first", () => {
  assert.deepEqual(validReasonPhrases(REASON, ["powder lifecycle model", "lifecycle model in"]), ["powder lifecycle model"]);
  assert.deepEqual(validReasonPhrases(REASON, ["powder lifecycle model", "powder lifecycle model"]), ["powder lifecycle model"]);
  assert.deepEqual(validReasonPhrases("new powder helps; more new powder follows", ["new powder", "new powder"]), ["new powder"]);
});

test("at most two phrases survive", () => {
  assert.deepEqual(validReasonPhrases(REASON, ["powder lifecycle model", "used material", "same producer", "new powder"]), ["powder lifecycle model", "used material"]);
});

test("an empty or missing reason, or malformed candidates, give no phrases", () => {
  assert.deepEqual(validReasonPhrases("", ["powder lifecycle"]), []);
  assert.deepEqual(validReasonPhrases(null, ["powder lifecycle"]), []);
  assert.deepEqual(validReasonPhrases(REASON, null), []);
  assert.deepEqual(validReasonPhrases(REASON, "powder lifecycle model"), []);
  assert.deepEqual(validReasonPhrases(REASON, [42, null, { a: 1 }, ""]), []);
});

test("an overridden reason drops phrases that are no longer in it", () => {
  assert.deepEqual(validReasonPhrases("An editor rewrote this sentence.", ["powder lifecycle model"]), []);
});
