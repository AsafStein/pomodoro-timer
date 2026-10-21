import type { WorkSession } from "./sessions";
import type { Task } from "./tasks";

export type PeriodKind = "day" | "week" | "month";

export type ChartBucket = {
  key: string;
  label: string;
  axisLabel: string;
  focusMs: number;
  isCurrent: boolean;
};

export type TaskBreakdown = {
  key: string;
  name: string;
  focusMs: number;
  pomodoros: number;
  archived: boolean;
};

export type PeriodReport = {
  kind: PeriodKind;
  start: number;
  end: number;
  label: string;
  isCurrent: boolean;
  focusMs: number;
  pomodoros: number;
  partialMs: number;
  breakdown: TaskBreakdown[];
  chart: ChartBucket[];
};

const UNASSIGNED = "בלי משימה";
const DELETED = "משימה שנמחקה";

function startOfDay(ts: number): Date {
  const date = new Date(ts);
  date.setHours(0, 0, 0, 0);
  return date;
}

/** Calendar bounds in the device timezone. Weeks start on Sunday, the convention used in Israel. */
export function periodBounds(kind: PeriodKind, anchor: number): { start: number; end: number } {
  const start = startOfDay(anchor);
  if (kind === "week") start.setDate(start.getDate() - start.getDay());
  if (kind === "month") start.setDate(1);
  const end = new Date(start);
  if (kind === "day") end.setDate(end.getDate() + 1);
  else if (kind === "week") end.setDate(end.getDate() + 7);
  else end.setMonth(end.getMonth() + 1);
  return { start: start.getTime(), end: end.getTime() };
}

export function shiftAnchor(kind: PeriodKind, anchor: number, delta: number): number {
  const { start } = periodBounds(kind, anchor);
  const date = new Date(start);
  if (kind === "month") date.setMonth(date.getMonth() + delta);
  else date.setDate(date.getDate() + delta * (kind === "week" ? 7 : 1));
  return date.getTime();
}

const dayYear = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "long", year: "numeric" });
const dayMonth = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "long" });
const monthYear = new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric" });
const weekdayLong = new Intl.DateTimeFormat("he-IL", { weekday: "long" });
const weekdayNarrow = new Intl.DateTimeFormat("he-IL", { weekday: "narrow" });
const hourLabel = new Intl.DateTimeFormat("he-IL", { hour: "2-digit", minute: "2-digit" });

export function periodLabel(kind: PeriodKind, start: number, end: number): string {
  if (kind === "day") return dayYear.format(start);
  if (kind === "month") return monthYear.format(start);
  const last = end - 1;
  const startDate = new Date(start);
  const lastDate = new Date(last);
  if (startDate.getFullYear() === lastDate.getFullYear() && startDate.getMonth() === lastDate.getMonth()) {
    return `${startDate.getDate()}–${dayYear.format(last)}`;
  }
  if (startDate.getFullYear() === lastDate.getFullYear()) {
    return `${dayMonth.format(start)} – ${dayYear.format(last)}`;
  }
  return `${dayYear.format(start)} – ${dayYear.format(last)}`;
}

function focusInRange(sessions: WorkSession[], from: number, to: number): WorkSession[] {
  return sessions.filter(
    (session) => session.mode === "focus" && session.completedAt >= from && session.completedAt < to,
  );
}

function chartFor(kind: PeriodKind, start: number, end: number, now: number, sessions: WorkSession[]): ChartBucket[] {
  const buckets: ChartBucket[] = [];
  if (kind === "day") {
    for (let hour = 0; hour < 24; hour += 1) {
      const from = new Date(start);
      from.setHours(hour, 0, 0, 0);
      const to = new Date(from);
      to.setHours(hour + 1, 0, 0, 0);
      const fromMs = from.getTime();
      const toMs = Math.min(end, to.getTime());
      buckets.push({
        key: `h-${hour}`,
        label: String(hour).padStart(2, "0"),
        axisLabel: hourLabel.format(from),
        focusMs: sumFocus(focusInRange(sessions, fromMs, toMs)),
        isCurrent: now >= fromMs && now < toMs,
      });
    }
    return buckets;
  }

  const cursor = new Date(start);
  while (cursor.getTime() < end) {
    const fromMs = cursor.getTime();
    const next = new Date(cursor);
    next.setDate(next.getDate() + 1);
    const toMs = Math.min(end, next.getTime());
    buckets.push({
      key: `d-${fromMs}`,
      label: kind === "week" ? weekdayNarrow.format(cursor) : String(cursor.getDate()),
      axisLabel: kind === "week" ? weekdayLong.format(cursor) : dayMonth.format(cursor),
      focusMs: sumFocus(focusInRange(sessions, fromMs, toMs)),
      isCurrent: now >= fromMs && now < toMs,
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return buckets;
}

function sumFocus(sessions: WorkSession[]): number {
  return sessions.reduce((sum, session) => sum + session.durationMs, 0);
}

function breakdownFor(sessions: WorkSession[], tasks: Task[]): TaskBreakdown[] {
  const rows = new Map<string, TaskBreakdown>();
  for (const session of sessions) {
    const key = session.taskId ?? "";
    const task = session.taskId ? tasks.find((item) => item.id === session.taskId) : undefined;
    const name = task?.name ?? session.taskName ?? (session.taskId ? DELETED : UNASSIGNED);
    const row = rows.get(key) ?? {
      key,
      name,
      focusMs: 0,
      pomodoros: 0,
      archived: task?.archivedAt != null,
    };
    row.name = name;
    row.archived = task?.archivedAt != null;
    row.focusMs += session.durationMs;
    if (!session.partial) row.pomodoros += 1;
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => {
    if (b.focusMs !== a.focusMs) return b.focusMs - a.focusMs;
    return a.name.localeCompare(b.name, "he");
  });
}

export function buildReport(
  sessions: WorkSession[],
  tasks: Task[],
  kind: PeriodKind,
  anchor: number,
  now = anchor,
): PeriodReport {
  const { start, end } = periodBounds(kind, anchor);
  const inPeriod = focusInRange(sessions, start, end);
  const partialMs = inPeriod.filter((session) => session.partial).reduce((sum, session) => sum + session.durationMs, 0);
  return {
    kind,
    start,
    end,
    label: periodLabel(kind, start, end),
    isCurrent: now >= start && now < end,
    focusMs: sumFocus(inPeriod),
    pomodoros: inPeriod.filter((session) => !session.partial).length,
    partialMs,
    breakdown: breakdownFor(inPeriod, tasks),
    chart: chartFor(kind, start, end, now, sessions),
  };
}
