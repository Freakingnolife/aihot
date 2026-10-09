import "./setup.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { selectHotCovers } from "@aihot/backend/publication/stories";

const unknown = (story_id: number, url: string) => ({ story_id, m: { kind: "image", url } });
const good = (story_id: number, url: string) => ({ story_id, m: { kind: "image", url, width: 780, height: 470 } });

test("Trending keeps the first unknown in SQL order and promotes the first good photo", () => {
  const selected = selectHotCovers([
    unknown(1, "https://example.org/representative.jpg"),
    unknown(1, "https://example.org/lower-ranked.jpg"),
    unknown(2, "https://example.org/unknown.jpg"),
    good(2, "https://example.org/good.jpg"),
    good(2, "https://example.org/next-good.jpg"),
    good(3, "https://example.org/first-good.jpg"),
    good(3, "https://example.org/second-good.jpg"),
  ]);
  assert.equal(selected.get(1)?.url, "https://example.org/representative.jpg");
  assert.equal(selected.get(2)?.url, "https://example.org/good.jpg");
  assert.equal(selected.get(3)?.url, "https://example.org/first-good.jpg");
});

test("Trending skips malformed URLs, rejects escaped small dimensions and selects escaped good dimensions", () => {
  const selected = selectHotCovers([
    unknown(1, "/relative.jpg"),
    good(1, "https://example.org/valid.jpg"),
    { story_id: 2, m: { kind: "image", url: "https://example.org/photo.jpg?a=1&amp;b=2", width: 600, height: 400 } },
    { story_id: 3, m: { kind: "image", url: "https://example.org/photo.jpg?a=1&amp;b=2", width: 780, height: 470 } },
    unknown(4, "/relative.jpg"),
    unknown(4, "not a URL"),
  ]);
  assert.equal(selected.get(1)?.url, "https://example.org/valid.jpg");
  assert.equal(selected.has(2), false);
  assert.equal(selected.get(3)?.width, 780);
  assert.equal(selected.get(3)?.height, 470);
  assert.equal(selected.has(4), false);
});

test("Trending does not promote a single-slash URL that looks good, keeping the valid unknown photo", () => {
  const selected = selectHotCovers([
    unknown(1, "https://example.org/valid.webp"),
    good(1, "https:/example.org/photo-780x470.jpg"),
  ]);
  assert.equal(selected.get(1)?.url, "https://example.org/valid.webp");
});
