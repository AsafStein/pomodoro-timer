import type { FinishedSession, Mode } from "./engine";

export function dayKey(ts: number): string {
  const date = new Date(ts);
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

export function greeting(name: string, date: Date): string {
  const hour = date.getHours();
  const hello =
    hour < 5 || hour >= 22
      ? "לילה טוב"
      : hour < 12
        ? "בוקר טוב"
        : hour < 17
          ? "צהריים טובים"
          : "ערב טוב";
  const trimmed = name.trim();
  return trimmed ? `${hello}, ${trimmed}` : hello;
}

export function formatMinutes(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  if (minutes === 0) return "0 דקות";
  if (minutes === 1) return "דקה אחת";
  if (minutes === 2) return "שתי דקות";
  return `${minutes} דקות`;
}

export function formatStreak(days: number): string {
  if (days <= 0) return "אין רצף עדיין";
  if (days === 1) return "רצף של יום אחד";
  if (days === 2) return "רצף של יומיים";
  return `רצף של ${days} ימים`;
}

export function modeLabel(mode: Mode): string {
  if (mode === "focus") return "מיקוד";
  if (mode === "short") return "הפסקה קצרה";
  return "הפסקה ארוכה";
}

export function sessionsOnDay(
  sessions: FinishedSession[],
  now: number,
  mode?: Mode,
): FinishedSession[] {
  const key = dayKey(now);
  return sessions.filter(
    (session) => dayKey(session.completedAt) === key && (mode == null || session.mode === mode),
  );
}

export function focusStreak(sessions: FinishedSession[], now: number): number {
  const days = new Set(
    sessions.filter((session) => session.mode === "focus").map((session) => dayKey(session.completedAt)),
  );
  const cursor = new Date(now);
  cursor.setHours(12, 0, 0, 0);
  if (!days.has(dayKey(cursor.getTime()))) {
    cursor.setDate(cursor.getDate() - 1);
  }
  let count = 0;
  while (days.has(dayKey(cursor.getTime()))) {
    count += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}

export type WeekDay = {
  key: string;
  label: string;
  minutes: number;
  isToday: boolean;
};

export function weekFocus(sessions: FinishedSession[], now: number): WeekDay[] {
  const days: WeekDay[] = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(now);
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - offset);
    const key = dayKey(date.getTime());
    const minutes = sessions
      .filter((session) => session.mode === "focus" && dayKey(session.completedAt) === key)
      .reduce((sum, session) => sum + session.durationMs / 60_000, 0);
    days.push({
      key,
      label: new Intl.DateTimeFormat("he-IL", { weekday: "narrow" }).format(date),
      minutes,
      isToday: offset === 0,
    });
  }
  return days;
}
