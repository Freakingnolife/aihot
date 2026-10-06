// Aggregate counting of MCP tool calls in the site's self-hosted Umami: one event per call, naming only the
// tool. No client address, header, argument or query text is sent. Fire and forget: it never delays or fails
// a tool answer, and a collector that is down or slow is simply not counted.
import { config } from "@aihot/backend/config";

const HOSTNAME = "mcp.additiveos.com";
// Umami drops requests whose User-Agent looks like a bot (the isbot list names "radar", "server" and bare
// product tokens); this one names the product and is accepted.
const USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AdditiveOS-MCP/1.0";

export interface UsageCounterOptions {
  websiteId: string | null;
  url: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

export function createUsageCounter(options: UsageCounterOptions): (tool: string) => void {
  const { websiteId, url, timeoutMs = 2000, fetch: send = fetch } = options;
  if (!websiteId) return () => {};
  return (tool) => {
    try {
      const body = JSON.stringify({ type: "event", payload: { website: websiteId, hostname: HOSTNAME, url: `/mcp/${tool}`, name: tool } });
      send(url, { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT }, body, signal: AbortSignal.timeout(timeoutMs) })
        .then((res) => res.body?.cancel())
        .catch(() => {});
    } catch {
      // Counting is best effort.
    }
  };
}

/** The server's counter, set up from the environment (off unless ANALYTICS_MCP_WEBSITE_ID is set). */
export const countToolCall = createUsageCounter({ websiteId: config.analyticsMcpWebsiteId, url: config.analyticsUrl });
