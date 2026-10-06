import assert from "node:assert/strict";
import { test } from "node:test";
import { splitByPhrases } from "../app/features/feed/phrases.ts";

const TEXT = "The agreement illustrates a powder lifecycle model in which an AM manufacturer buys new powder.";

test("phrases come out as bold parts and the text is never changed", () => {
  const parts = splitByPhrases(TEXT, ["new powder", "powder lifecycle model"]);
  assert.equal(parts.map((p) => p.text).join(""), TEXT);
  assert.deepEqual(parts.filter((p) => p.bold).map((p) => p.text), ["powder lifecycle model", "new powder"]);
});

test("a phrase that is not in the text, differs in case, is empty or overlaps an earlier one is ignored", () => {
  const parts = splitByPhrases(TEXT, ["powder lifecycle model", "Powder lifecycle", "lifecycle model in", "", "closed loop"]);
  assert.deepEqual(parts.filter((p) => p.bold).map((p) => p.text), ["powder lifecycle model"]);
  assert.equal(parts.map((p) => p.text).join(""), TEXT);
});

test("no phrases leave one plain part; no text leaves none", () => {
  assert.deepEqual(splitByPhrases(TEXT, []), [{ text: TEXT, bold: false }]);
  assert.deepEqual(splitByPhrases("", ["powder lifecycle"]), []);
});

test("regular-expression characters in a phrase are plain text", () => {
  const parts = splitByPhrases("Cost (US$8M) rose.", ["(US$8M)"]);
  assert.deepEqual(parts.filter((p) => p.bold).map((p) => p.text), ["(US$8M)"]);
});
