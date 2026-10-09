import "./setup.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { selectReportCover } from "@aihot/backend/publication/reports";

const image = (url: string, width?: number, height?: number) => ({ m: { kind: "image", url, ...(width === undefined ? {} : { width }), ...(height === undefined ? {} : { height }) } });

test("report cover selection skips malformed URLs and returns no cover when every URL is invalid", () => {
  const valid = image("https://example.org/valid.jpg", 780, 470);
  assert.equal(selectReportCover([image("/relative.jpg"), valid]), valid);
  assert.equal(selectReportCover([image("/relative.jpg"), image("not a URL")]), undefined);
});

test("report cover selection does not promote a single-slash URL that looks good, keeping the valid unknown photo", () => {
  const valid = image("https://example.org/valid.webp");
  assert.equal(selectReportCover([valid, image("https:/example.org/photo-780x470.jpg", 780, 470)]), valid);
});

test("report cover selection preserves escaped URL dimensions", () => {
  const small = image("https://example.org/photo.jpg?a=1&amp;b=2", 600, 400);
  const good = image("https://example.org/photo.jpg?a=1&amp;b=2", 780, 470);
  assert.equal(selectReportCover([small]), undefined);
  assert.equal(selectReportCover([small, good]), good);
});
