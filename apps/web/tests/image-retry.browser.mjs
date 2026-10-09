// Run after web dependencies are installed with PLAYWRIGHT_MODULE set to a Playwright module.
// Example: PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node apps/web/tests/image-retry.browser.mjs
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rolldown } from "rolldown";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const playwright = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const { chromium } = playwright;
const dir = await fs.mkdtemp(path.join(os.tmpdir(), "radar-image-retry-"));
const entry = path.join(dir, "entry.tsx");
const bundlePath = path.join(dir, "bundle.js");
await fs.writeFile(entry, `
import React from '${root}/node_modules/react/index.js';
import { createRoot } from '${root}/node_modules/react-dom/client.js';
import PosterSheet from '${root}/apps/web/app/features/item/PosterSheet.tsx';
import { LeadPicture } from '${root}/apps/web/app/features/report/ReportPaper.tsx';
function Report({ src }) { const [failed, setFailed] = React.useState(false); return failed ? <p>report fallback</p> : <LeadPicture cover={{url:src,width:780,height:470,caption:'caption'}} onError={() => setFailed(true)} />; }
const params = new URLSearchParams(location.search);
createRoot(document.getElementById('root')).render(params.get('mode') === 'poster' ? <PosterSheet id='retry-check' title='Retry check' open={true} onClose={() => {}} /> : <Report src={params.get('ok') ? '/success.jpg' : '/report.jpg'} />);
`);
const build = await rolldown({
  input: entry,
  cwd: root,
  transform: { jsx: { runtime: "automatic" } },
  resolve: { alias: { "react/jsx-runtime": `${root}/node_modules/react/jsx-runtime.js` } },
  plugins: [{ name: "expose-lead-picture", async load(id) {
    if (id.endsWith("/ReportPaper.tsx")) return `${await fs.readFile(id, "utf8")}\nexport { LeadPicture };`;
  } }],
});
await build.write({ file: bundlePath, format: "iife" });
await build.close();
const bundle = await fs.readFile(bundlePath);
const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#176b75" } }).png().toBuffer();
const hits = [];
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://local");
  if (url.pathname === "/bundle.js") { res.setHeader("content-type", "text/javascript"); return res.end(bundle); }
  if (url.pathname === "/") { res.setHeader("content-type", "text/html"); return res.end('<div id="root"></div><script src="/bundle.js"></script>'); }
  if (["/og/posters/retry-check.png", "/report.jpg", "/success.jpg"].includes(url.pathname)) hits.push(url.pathname + url.search);
  if (url.pathname === "/success.jpg" && url.searchParams.get("retry") === "1") {
    res.writeHead(200, { "content-type": "image/png" });
    return res.end(png);
  }
  res.writeHead(502, { "cache-control": "no-store" });
  res.end("unavailable");
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const mode of ["poster", "report"]) {
    hits.length = 0;
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/?mode=${mode}`);
    const fallback = mode === "poster" ? "The poster could not be generated" : "report fallback";
    await page.getByText(fallback).waitFor();
    assert.equal(hits.length, 2, `${mode} should make exactly one original request and one retry`);
    assert.match(hits[0], /\.png$|\.jpg$/);
    assert.match(hits[1], /retry=1/);
    await page.close();
  }
  hits.length = 0;
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/?mode=report&ok=1`);
  await page.waitForFunction(() => document.querySelector("img")?.naturalWidth === 4);
  assert.equal(hits.length, 2, "a successful second report request should load without a third request");
  assert.match(hits[1], /retry=1/);
  await page.close();
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(dir, { recursive: true, force: true });
}
