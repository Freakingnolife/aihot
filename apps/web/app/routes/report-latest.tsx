import { SITE, withSubject } from "@aihot/industry/site";
import { Link, useLoaderData } from "react-router";
import type { Route } from "./+types/report-latest";
import type { PoolResponse, ReportDetail, ReportNavigationEntry } from "@aihot/contracts/site";
import { loadOr404 } from "../lib/api.server";
import { pageMeta } from "../lib/seo";
import { beijingDate } from "../lib/format";
import { EmptyState } from "../components/ui/Page";
import { ReportLayout } from "../features/report/ReportLayout";
import { ReportPaper } from "../features/report/ReportPaper";
import { LeadStories } from "../features/feed/LeadStories";
import { splitLead } from "../features/feed/lead";
import { KIND_LABEL, kindFromPath } from "../features/report/format";

export async function loader({ request }: Route.LoaderArgs) {
  const kind = kindFromPath(new URL(request.url).pathname);
  const { index, report } = await loadOr404<{ index: ReportNavigationEntry[]; report: ReportDetail | null }>(`/api/site/reports/${kind}/latest-page`, { signal: request.signal });
  // With no briefing yet the page shows the latest news instead of a dead end.
  const latest = report ? null : await loadOr404<PoolResponse>("/api/site/pool?mode=recent", { signal: request.signal });
  const front = latest ? splitLead(latest.items) : null;
  return { kind, report, index, lead: front?.lead ?? null, grid: front?.grid ?? [], today: beijingDate(Date.now()) };
}

export function meta({ loaderData, location }: Route.MetaArgs) {
  const kind = loaderData?.kind ?? "daily";
  return pageMeta({
    title: `AM ${KIND_LABEL[kind]}`,
    description: kind === "daily" ? `${SITE.name} ${withSubject("Daily briefing")}.` : kind === "weekly" ? "Weekly archive." : "Monthly archive.",
    path: location.pathname,
    image: `/og/pages/${kind}.png`,
    noindex: !loaderData?.report,
  });
}

export function headers() {
  return { "Cache-Control": "public, max-age=0, s-maxage=600, stale-while-revalidate=300" };
}

export default function ReportLatestPage() {
  const { kind, report, index, lead, grid, today } = useLoaderData<typeof loader>();
  return (
    <ReportLayout kind={kind} index={index} current={report?.key ?? null} today={today}>
      {report ? <ReportPaper report={report} index={index} /> : (
        <>
          <EmptyState title={`No automatic report published — ${KIND_LABEL[kind]}`}>Briefings are not generated on a schedule.</EmptyState>
          {lead && (
            <div className="pt-4">
              <div className="mb-5 flex items-baseline justify-between gap-4">
                <h2 className="text-[32px] font-normal leading-[1.15] tracking-[-0.035em] text-ink">Latest news</h2>
                <Link to="/all" className="text-[13px] font-medium text-accent hover:text-accent-ink">All latest news</Link>
              </div>
              <LeadStories lead={lead} grid={grid} latest={[]} />
            </div>
          )}
        </>
      )}
    </ReportLayout>
  );
}
