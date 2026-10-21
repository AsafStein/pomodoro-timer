"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { buildReport, shiftAnchor, type PeriodKind } from "@/lib/reports";
import type { WorkSession } from "@/lib/sessions";
import { formatDuration, formatPomodoros } from "@/lib/stats";
import type { Task } from "@/lib/tasks";
import { cn } from "@/lib/utils";

const KINDS: { id: PeriodKind; label: string; current: string }[] = [
  { id: "day", label: "יום", current: "היום" },
  { id: "week", label: "שבוע", current: "השבוע" },
  { id: "month", label: "חודש", current: "החודש" },
];

type ReportsViewProps = {
  sessions: WorkSession[];
  tasks: Task[];
};

export function ReportsView({ sessions, tasks }: ReportsViewProps) {
  const [kind, setKind] = useState<PeriodKind>("week");
  const [anchor, setAnchor] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const report = buildReport(sessions, tasks, kind, anchor, now);
  const current = KINDS.find((item) => item.id === kind) ?? KINDS[0];
  const peak = Math.max(1, ...report.chart.map((bucket) => bucket.focusMs));
  const chartLabel = `תרשים ${report.label}: ${formatDuration(report.focusMs)}, ${formatPomodoros(report.pomodoros)}`;

  return (
    <section className="relative mx-auto flex w-full max-w-xl flex-col gap-4 pb-6" aria-label="דוחות">
      <div>
        <h2 className="text-2xl font-medium tracking-tight">דוחות</h2>
        <p className="mt-1 text-sm text-muted-foreground">השבוע מתחיל ביום ראשון.</p>
      </div>

      <div className="grid grid-cols-3 gap-1 rounded-full bg-muted p-1" role="tablist" aria-label="תקופה">
        {KINDS.map((item) => {
          const selected = kind === item.id;
          return (
            <Button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={selected}
              variant={selected ? "default" : "ghost"}
              className={cn("h-11 rounded-full", selected && "bg-[var(--focus)] text-[#1c1612] hover:bg-[var(--focus)]")}
              onClick={() => setKind(item.id)}
            >
              {item.label}
            </Button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-11 shrink-0 rounded-full px-4"
          onClick={() => setAnchor((currentAnchor) => shiftAnchor(kind, currentAnchor, -1))}
        >
          הקודם
        </Button>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-sm font-medium">{report.label}</p>
          {report.isCurrent ? <p className="text-xs text-muted-foreground">{current.current}</p> : null}
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-11 shrink-0 rounded-full px-4"
          disabled={report.isCurrent}
          onClick={() => setAnchor((currentAnchor) => shiftAnchor(kind, currentAnchor, 1))}
        >
          הבא
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <article className="rounded-3xl border border-border bg-card/80 p-4">
          <h3 className="text-sm text-muted-foreground">זמן ריכוז</h3>
          <p className="mt-2 text-2xl font-medium leading-tight">{formatDuration(report.focusMs)}</p>
        </article>
        <article className="rounded-3xl border border-border bg-card/80 p-4">
          <h3 className="text-sm text-muted-foreground">פומודורו</h3>
          <p className="mt-2 text-2xl font-medium tabular-nums">{report.pomodoros}</p>
          <p className="text-xs text-muted-foreground">שהושלמו</p>
        </article>
      </div>
      {report.partialMs > 0 ? (
        <p className="text-sm text-muted-foreground">
          כולל {formatDuration(report.partialMs)} מיקוד חלקי, בלי פומודורו שהושלם.
        </p>
      ) : null}

      <section className="rounded-3xl border border-border bg-card/80 p-5">
        <h3 className="text-sm text-muted-foreground">
          {kind === "day" ? "לפי שעה" : kind === "week" ? "לפי יום" : "לפי יום בחודש"}
        </h3>
        <div className="mt-4 flex h-32 items-end gap-px" role="img" aria-label={chartLabel}>
          {report.chart.map((bucket) => {
            const showLabel = kind === "week" || (kind === "day" && Number(bucket.label) % 6 === 0);
            return (
              <div key={bucket.key} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <div className="flex h-20 w-full items-end">
                  <div
                    title={`${bucket.axisLabel}: ${formatDuration(bucket.focusMs)}`}
                    className={cn(
                      "w-full rounded-full",
                      bucket.focusMs > 0 ? "bg-[var(--focus)]" : "bg-foreground/10",
                      bucket.isCurrent && bucket.focusMs > 0 && "ring-2 ring-foreground/30",
                    )}
                    style={{
                      height: bucket.focusMs > 0 ? `${Math.max(12, (bucket.focusMs / peak) * 100)}%` : "4px",
                    }}
                  />
                </div>
                <span
                  className={cn(
                    "h-4 text-[10px] leading-4",
                    bucket.isCurrent ? "text-foreground" : "text-muted-foreground",
                    !showLabel && "text-transparent",
                  )}
                >
                  {showLabel ? bucket.label : "·"}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-3xl border border-border bg-card/80 p-5">
        <h3 className="text-sm text-muted-foreground">לפי משימה</h3>
        {report.breakdown.length === 0 ? (
          <p className="mt-3 text-sm leading-6 text-muted-foreground">אין ריכוז בתקופה הזו.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-4">
            {report.breakdown.map((row) => {
              const width = report.focusMs > 0 ? Math.max(8, (row.focusMs / report.focusMs) * 100) : 0;
              return (
                <li key={row.key || "none"}>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 truncate font-medium">
                      {row.name}
                      {row.archived ? <span className="text-xs font-normal text-muted-foreground"> · ארכיון</span> : null}
                    </p>
                    <p className="shrink-0 text-sm text-muted-foreground tabular-nums">
                      {formatDuration(row.focusMs)}
                    </p>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-foreground/10" aria-hidden="true">
                    <div className="h-full rounded-full bg-[var(--focus)]" style={{ width: `${width}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{formatPomodoros(row.pomodoros)}</p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </section>
  );
}
