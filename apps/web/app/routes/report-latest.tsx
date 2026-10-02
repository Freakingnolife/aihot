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
import { LeadStories, splitLead } from "../features/feed/LeadStories";
import { KIND_LABEL, kindFromPath } from "../features/report/format";

export async function loader({ request }: Route.LoaderArgs) {
  const kind = kindFromPath(new URL(request.url).pathname);
  const { index, report } = await loadOr404<{ index: ReportNavigationEntry[]; report: ReportDetail | null }>(`/api/site/reports/${kind}/latest-page`, { signal: request.signal });
  // With no briefing yet the page shows the latest drafts instead of a dead end.
  const latest = report ? null : await loadOr404<PoolResponse>("/api/site/pool?mode=recent", { signal: request.signal });
  return { kind, report, index, latest: latest ? splitLead(latest.items).lead : [], today: beijingDate(Date.now()) };
}

export function meta({ loaderData, location }: Route.MetaArgs) {
  const kind = loaderData?.kind ?? "daily";
  return pageMeta({
    title: `AM ${KIND_LABEL[kind]}`,
    description: kind === "daily" ? `${SITE.name} private${withSubject("Daily briefing")}。` : kind === "weekly" ? "Weekly archive." : "Monthly archive.",
    path: location.pathname,
    image: `/og/pages/${kind}.png`,
  });
}

export function headers() {
  return { "Cache-Control": "public, max-age=0, s-maxage=600, stale-while-revalidate=300" };
}

export default function ReportLatestPage() {
  const { kind, report, index, latest, today } = useLoaderData<typeof loader>();
  return (
    <ReportLayout kind={kind} index={index} current={report?.key ?? null} today={today}>
      {report ? <ReportPaper report={report} index={index} /> : (
        <>
          <EmptyState title={`No automatic report published — ${KIND_LABEL[kind]}`}>The pilot briefing is a manually assembled Markdown draft. No report cron is running.</EmptyState>
          {latest.length > 0 && (
            <div className="pt-4">
              <div className="mb-5 flex items-baseline justify-between gap-4">
                <h2 className="text-[32px] font-normal leading-[1.15] tracking-[-0.035em] text-ink">Latest drafts</h2>
                <Link to="/all" className="text-[13px] font-medium text-accent hover:text-accent-ink">All recent drafts</Link>
              </div>
              <LeadStories items={latest} />
            </div>
          )}
        </>
      )}
    </ReportLayout>
  );
}
