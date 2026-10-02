import type { ReactNode } from "react";
import type { ReportNavigationEntry, ReportKind } from "@aihot/contracts/site";
import { ReportArchive, ReportPhoneNav } from "./ReportNav";

/**
 * Report pages sit beside their own archive column (desktop), under the masthead; phones get the kind
 * tabs and recent issues above the page instead. The paper fills the space beside the archive.
 */
export function ReportLayout({ kind, index, current, today, children }: { kind: ReportKind; index: ReportNavigationEntry[]; current: string | null; today: string; children: ReactNode }) {
  return (
    <div className="report-shell lg:flex lg:gap-8">
      <ReportArchive kind={kind} index={index} current={current} />
      <div className="min-w-0 flex-1 pb-6 lg:pb-8">
        <ReportPhoneNav kind={kind} index={index} current={current} today={today} />
        <div className="w-full">{children}</div>
      </div>
    </div>
  );
}
