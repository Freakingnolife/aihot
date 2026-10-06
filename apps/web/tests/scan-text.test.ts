import assert from "node:assert/strict";
import { test } from "node:test";
import { scanText } from "../app/features/feed/scan-text.ts";

test("emphasis preserves wording, numerical conditions and qualifications exactly", () => {
  const text = "ESA’s fifth ISS metal-printed sample may support future trials, not proven performance.";
  const parts = scanText(text);
  assert.equal(parts.map((p) => p.text).join(""), text);
  assert.deepEqual(parts.filter((p) => p.emphasis).map((p) => p.text), ["ESA", "ISS"]);
});

test("tags stay whole and the longest tag wins", () => {
  const parts = scanText("Nickel 718 powder buy-back agreement", ["Nickel", "Nickel 718"]);
  assert.deepEqual(parts.filter((p) => p.emphasis).map((p) => p.text), ["Nickel 718"]);
});

test("words that are not tags or acronyms are never emphasised, whatever their capitalization", () => {
  const parts = scanText("New 3D Printed Oral Medicines and field trials arrive", []);
  assert.deepEqual(parts.filter((p) => p.emphasis), []);
});

test("tags are literal, boundaries avoid partial words, and HTML stays plain text", () => {
  const text = "C++ polymers <script>never execute</script>";
  const parts = scanText(text, ["C++", "polymer", "script>"]);
  assert.equal(parts.map((p) => p.text).join(""), text);
  assert.equal(parts.some((p) => p.emphasis && p.text === "polymer"), false);
  assert.equal(parts[0]?.text, "C++");
});

test("unmatched and empty text need no artificial emphasis", () => {
  assert.deepEqual(scanText("a quiet report"), [{ text: "a quiet report", emphasis: false }]);
  assert.deepEqual(scanText(""), []);
});

test("currency prefixes and repeated acronyms do not use up the keyword allowance", () => {
  const parts = scanText("US$8M–US$10M NASA and NASA sign ESA deal", ["deal"]);
  assert.deepEqual(parts.filter((p) => p.emphasis).map((p) => p.text), ["NASA", "ESA"]);
});

test("at most two items are emphasised in a block", () => {
  const parts = scanText("NASA, ESA and JAXA back the plan", ["plan"]);
  assert.equal(parts.filter((p) => p.emphasis).length, 2);
});
