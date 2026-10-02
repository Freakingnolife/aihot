import assert from "node:assert/strict";
import { test } from "node:test";
import { displayTitle } from "../app/lib/format.ts";

test("strips a leading publisher prefix that matches the source name", () => {
  assert.equal(displayTitle("TCT Magazine: University of Nottingham-led project", "TCT Magazine"), "University of Nottingham-led project");
  assert.equal(displayTitle("3D Printing Industry: Private Donation", "3D Printing Industry"), "Private Donation");
});

test("matches case-insensitively", () => {
  assert.equal(displayTitle("tct magazine: A story", "TCT Magazine"), "A story");
});

test("keeps titles whose prefix is not exactly the source name", () => {
  assert.equal(displayTitle("TCT: A story", "TCT Magazine"), "TCT: A story");
  assert.equal(displayTitle("Formnext: Show preview", "Formnext Magazine"), "Formnext: Show preview");
  assert.equal(displayTitle("Why TCT Magazine: a look", "TCT Magazine"), "Why TCT Magazine: a look");
});

test("keeps the title when nothing would remain or the source is missing", () => {
  assert.equal(displayTitle("TCT Magazine:", "TCT Magazine"), "TCT Magazine:");
  assert.equal(displayTitle("TCT Magazine: Story", ""), "TCT Magazine: Story");
  assert.equal(displayTitle("TCT Magazine: Story", null), "TCT Magazine: Story");
});
