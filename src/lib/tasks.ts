import type { WorkSession } from "./sessions";

export type Task = {
  id: string;
  name: string;
  createdAt: number;
  archivedAt: number | null;
};

export type TaskSort = "time" | "name";

export type TaskSummary = {
  task: Task;
  focusMs: number;
  pomodoros: number;
};

export type TaskList = {
  active: TaskSummary[];
  archived: TaskSummary[];
  unassignedMs: number;
  unassignedPomodoros: number;
};

export function summarizeTasks(tasks: Task[], sessions: WorkSession[], sort: TaskSort): TaskList {
  const totals = new Map<string, { focusMs: number; pomodoros: number }>();
  let unassignedMs = 0;
  let unassignedPomodoros = 0;
  const known = new Set(tasks.map((task) => task.id));

  for (const session of sessions) {
    if (session.mode !== "focus") continue;
    if (session.taskId == null) {
      unassignedMs += session.durationMs;
      if (!session.partial) unassignedPomodoros += 1;
      continue;
    }
    if (!known.has(session.taskId)) continue;
    const row = totals.get(session.taskId) ?? { focusMs: 0, pomodoros: 0 };
    row.focusMs += session.durationMs;
    if (!session.partial) row.pomodoros += 1;
    totals.set(session.taskId, row);
  }

  const toSummary = (task: Task): TaskSummary => ({
    task,
    focusMs: totals.get(task.id)?.focusMs ?? 0,
    pomodoros: totals.get(task.id)?.pomodoros ?? 0,
  });

  const compare = (a: TaskSummary, b: TaskSummary) => {
    if (sort === "name") return a.task.name.localeCompare(b.task.name, "he");
    if (b.focusMs !== a.focusMs) return b.focusMs - a.focusMs;
    return a.task.name.localeCompare(b.task.name, "he");
  };

  return {
    active: tasks.filter((task) => task.archivedAt == null).map(toSummary).sort(compare),
    archived: tasks.filter((task) => task.archivedAt != null).map(toSummary).sort(compare),
    unassignedMs,
    unassignedPomodoros,
  };
}
