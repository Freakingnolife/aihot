// Local preview of additiveos.com as one site: the news reader at the root and the AdditiveOS landing page
// at /advisor. It stands in for Cloudflare Tunnel path routing (one hostname, two services); nothing here
// is deployed. The landing page keeps its own paths (/static, /api/early-access, /privacy).
//   node scripts/combined-preview.ts   (NEWS=http://127.0.0.1:4310 LANDING=http://127.0.0.1:4320 PORT=4300)
import { createServer, request } from "node:http";

const NEWS = new URL(process.env.NEWS ?? "http://127.0.0.1:4310");
const LANDING = new URL(process.env.LANDING ?? "http://127.0.0.1:4320");
const PORT = Number(process.env.PORT ?? 4300);

/** The landing service's paths; everything else is the news reader. */
function route(path: string): { target: URL; path: string } {
  if (path === "/advisor" || path.startsWith("/advisor?")) return { target: LANDING, path: "/" + path.slice("/advisor".length) };
  if (/^\/(static\/|api\/early-access|privacy(\?|$))/.test(path)) return { target: LANDING, path };
  return { target: NEWS, path };
}

createServer((req, res) => {
  const { target, path } = route(req.url ?? "/");
  const upstream = request({ host: target.hostname, port: target.port, method: req.method, path, headers: { ...req.headers, host: target.host } }, (up) => {
    res.writeHead(up.statusCode ?? 502, up.headers);
    up.pipe(res);
  });
  upstream.on("error", () => {
    res.writeHead(502, { "content-type": "text/plain" });
    res.end(`${target.origin} is not running`);
  });
  req.pipe(upstream);
}).listen(PORT, "127.0.0.1", () => console.log(`combined preview on http://127.0.0.1:${PORT}`));
