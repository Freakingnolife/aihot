// One hostname, two services: the news reader at the root and the AdditiveOS landing page at /advisor.
// Locally it stands in for Cloudflare Tunnel path routing; on the NAS (deploy/nas) it is the router the
// tunnel points at. The landing page keeps its own paths (/static, /api/early-access); /privacy is the
// reader's single privacy notice for the whole domain. Dependency-free.
//   node scripts/combined-preview.ts   (NEWS=http://127.0.0.1:4310 LANDING=http://127.0.0.1:4320 HOST=127.0.0.1 PORT=4300)
import { createServer, request } from "node:http";

const NEWS = new URL(process.env.NEWS ?? "http://127.0.0.1:4310");
const LANDING = new URL(process.env.LANDING ?? "http://127.0.0.1:4320");
const HOST = process.env.HOST ?? "127.0.0.1";
const PORT = Number(process.env.PORT ?? 4300);

/** The landing service's paths; everything else (including /privacy) is the news reader. */
function route(path: string): { target: URL; path: string } {
  if (/^\/advisor\/?(\?|$)/.test(path)) return { target: LANDING, path: path.replace(/^\/advisor\/?/, "/") };
  if (/^\/(static\/|api\/early-access(\?|$))/.test(path)) return { target: LANDING, path };
  return { target: NEWS, path };
}

createServer((req, res) => {
  const { target, path } = route(req.url ?? "/");
  const upstream = request({ host: target.hostname, port: target.port, method: req.method, path, headers: { ...req.headers, host: target.host } }, (up) => {
    res.writeHead(up.statusCode ?? 502, up.headers);
    up.pipe(res);
  });
  upstream.on("error", () => {
    if (res.headersSent) return res.destroy();
    res.writeHead(502, { "content-type": "text/plain" });
    res.end("Bad gateway");
  });
  res.on("close", () => upstream.destroy());
  req.pipe(upstream);
}).listen(PORT, HOST, () => console.log(`router on http://${HOST}:${PORT}`));
