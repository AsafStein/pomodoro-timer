import type { FinishedSession, Mode } from "./engine";

/** A recorded block of timer time. Completed pomodoros and stopped focus both live here. */
export type WorkSession = {
  id: string;
  mode: Mode;
  durationMs: number;
  completedAt: number;
  startedAt: number;
  taskId: string | null;
  /** Name at the time of recording. Reports prefer the live task name when the task still exists. */
  taskName: string | null;
  /** True when focus was stopped before the pomodoro finished. */
  partial: boolean;
};

export const SESSION_LIMIT = 4_000;

/** Ignore accidental taps. Real partial focus still counts toward the task. */
export const MIN_PARTIAL_MS = 15_000;

export const TASK_NAME_MAX = 60;
export const TASK_LIMIT = 300;

export function cleanTaskName(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, TASK_NAME_MAX);
}

export function sessionFromFinished(
  finished: FinishedSession,
  startedAt: number,
  task: { id: string; name: string } | null,
): WorkSession {
  const focus = finished.mode === "focus";
  return {
    id: finished.id,
    mode: finished.mode,
    durationMs: finished.durationMs,
    completedAt: finished.completedAt,
    startedAt,
    taskId: focus ? (task?.id ?? null) : null,
    taskName: focus ? (task?.name ?? null) : null,
    partial: false,
  };
}
