import {
  defaultSettings,
  durationMs,
  type Engine,
  type Mode,
  type Phase,
  type Settings,
} from "./engine";
import { SESSION_LIMIT, TASK_LIMIT, TASK_NAME_MAX, type WorkSession } from "./sessions";
import { initialState, reduce, type AppState } from "./store";
import type { Task } from "./tasks";

const KEY = "rikuz-v1";
const UNAVAILABLE = "unavailable";

export type BootResult = {
  state: AppState;
  error: string | null;
  save: boolean;
};

type Persisted = {
  version: 2;
  settings: Settings;
  engine: Engine;
  sessions: WorkSession[];
  tasks: Task[];
  activeTaskId: string | null;
};

export type LoadResult =
  | { status: "empty" }
  | { status: "ok"; state: AppState }
  | { status: "invalid" }
  | { status: "unavailable" };

function clamp(value: unknown, fallback: number, min: number, max: number): number {
  const number = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.min(max, Math.max(min, number));
}

function flag(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function sanitizeSettings(input: Partial<Settings> | undefined): Settings {
  const source = input ?? {};
  const name = typeof source.name === "string" ? source.name.slice(0, 24) : "";
  return {
    name,
    focusMin: clamp(source.focusMin, defaultSettings.focusMin, 1, 90),
    shortMin: clamp(source.shortMin, defaultSettings.shortMin, 1, 30),
    longMin: clamp(source.longMin, defaultSettings.longMin, 1, 45),
    cycleLength: clamp(source.cycleLength, defaultSettings.cycleLength, 2, 8),
    dailyGoal: clamp(source.dailyGoal, defaultSettings.dailyGoal, 1, 12),
    autoStartBreaks: flag(source.autoStartBreaks, defaultSettings.autoStartBreaks),
    autoStartFocus: flag(source.autoStartFocus, defaultSettings.autoStartFocus),
    sound: flag(source.sound, defaultSettings.sound),
    wakeLock: flag(source.wakeLock, defaultSettings.wakeLock),
    notifications: flag(source.notifications, defaultSettings.notifications),
  };
}

export function sanitizeEngine(input: unknown, settings: Settings): Engine {
  const source = (input ?? {}) as Partial<Engine>;
  const mode: Mode = source.mode === "short" || source.mode === "long" ? source.mode : "focus";
  const duration = durationMs(settings, mode);
  const remaining =
    typeof source.remainingMs === "number" && source.remainingMs >= 0
      ? Math.min(source.remainingMs, duration)
      : duration;
  const phase: Phase =
    source.phase === "running" || source.phase === "paused" ? source.phase : "idle";
  const endsAt = typeof source.endsAt === "number" ? source.endsAt : null;
  const cycleCount = Math.min(
    settings.cycleLength,
    Math.max(0, typeof source.cycleCount === "number" ? Math.round(source.cycleCount) : 0),
  );
  if (phase === "running" && endsAt == null) {
    return {
      mode,
      phase: "idle",
      remainingMs: duration,
      endsAt: null,
      cycleCount,
      segmentStartedAt: null,
      segmentBudgetMs: null,
    };
  }
  if (phase === "idle") {
    return {
      mode,
      phase,
      remainingMs: remaining,
      endsAt: null,
      cycleCount,
      segmentStartedAt: null,
      segmentBudgetMs: null,
    };
  }
  const segmentBudgetMs =
    typeof source.segmentBudgetMs === "number" && source.segmentBudgetMs > 0
      ? source.segmentBudgetMs
      : duration;
  const segmentStartedAt =
    typeof source.segmentStartedAt === "number" && Number.isFinite(source.segmentStartedAt)
      ? source.segmentStartedAt
      : phase === "running" && endsAt != null
        ? endsAt - Math.min(segmentBudgetMs, remaining)
        : null;
  return {
    mode,
    phase,
    remainingMs: remaining,
    endsAt: phase === "running" ? endsAt : null,
    cycleCount,
    segmentStartedAt,
    segmentBudgetMs,
  };
}

function sanitizeSessions(value: unknown): WorkSession[] {
  if (!Array.isArray(value)) return [];
  const sessions: WorkSession[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Partial<WorkSession>;
    if (typeof row.id !== "string" || typeof row.completedAt !== "number") continue;
    if (row.mode !== "focus" && row.mode !== "short" && row.mode !== "long") continue;
    if (typeof row.durationMs !== "number" || row.durationMs <= 0) continue;
    const startedAt =
      typeof row.startedAt === "number" && Number.isFinite(row.startedAt) && row.startedAt <= row.completedAt
        ? row.startedAt
        : row.completedAt - row.durationMs;
    const taskName =
      typeof row.taskName === "string" && row.taskName.trim()
        ? row.taskName.trim().slice(0, TASK_NAME_MAX)
        : null;
    sessions.push({
      id: row.id,
      mode: row.mode,
      durationMs: row.durationMs,
      completedAt: row.completedAt,
      startedAt,
      taskId: typeof row.taskId === "string" && row.taskId ? row.taskId : null,
      taskName,
      partial: row.partial === true,
    });
  }
  return sessions.slice(0, SESSION_LIMIT);
}

function sanitizeTasks(value: unknown): Task[] {
  if (!Array.isArray(value)) return [];
  const tasks: Task[] = [];
  const ids = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Partial<Task>;
    if (typeof row.id !== "string" || !row.id || ids.has(row.id)) continue;
    if (typeof row.name !== "string") continue;
    const name = row.name.trim().replace(/\s+/g, " ").slice(0, TASK_NAME_MAX);
    if (!name) continue;
    if (typeof row.createdAt !== "number" || !Number.isFinite(row.createdAt)) continue;
    ids.add(row.id);
    tasks.push({
      id: row.id,
      name,
      createdAt: row.createdAt,
      archivedAt: typeof row.archivedAt === "number" && Number.isFinite(row.archivedAt) ? row.archivedAt : null,
    });
  }
  return tasks.slice(0, TASK_LIMIT);
}

function sanitizeActiveTaskId(value: unknown, tasks: Task[]): string | null {
  if (typeof value !== "string") return null;
  return tasks.some((task) => task.id === value) ? value : null;
}

export function readPersistedRaw(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return UNAVAILABLE;
  }
}

export function subscribePersisted(): () => void {
  return () => {};
}

function parsePersisted(raw: string): LoadResult {
  if (raw === UNAVAILABLE) return { status: "unavailable" };
  if (!raw) return { status: "empty" };
  try {
    const parsed = JSON.parse(raw) as { version?: unknown; settings?: Partial<Settings> };
    if (parsed.version !== 1 && parsed.version !== 2) return { status: "invalid" };
    const settings = sanitizeSettings(parsed.settings);
    const tasks = parsed.version === 2 ? sanitizeTasks((parsed as { tasks?: unknown }).tasks) : [];
    const record = parsed as {
      engine?: unknown;
      sessions?: unknown;
      activeTaskId?: unknown;
    };
    return {
      status: "ok",
      state: {
        settings,
        engine: sanitizeEngine(record.engine, settings),
        sessions: sanitizeSessions(record.sessions),
        tasks,
        activeTaskId: sanitizeActiveTaskId(record.activeTaskId, tasks),
        notice: null,
      },
    };
  } catch {
    return { status: "invalid" };
  }
}

export function bootFromRaw(raw: string, now: number): BootResult {
  const loaded = parsePersisted(raw);
  if (loaded.status === "ok") {
    return {
      state: reduce(loaded.state, { type: "tick", now }),
      error: null,
      save: true,
    };
  }
  if (loaded.status === "empty") {
    return { state: initialState(), error: null, save: true };
  }
  if (loaded.status === "unavailable") {
    return {
      state: initialState(),
      error: "אי אפשר לקרוא את הזיכרון של הדפדפן. הטיימר יעבוד, בלי שמירה.",
      save: false,
    };
  }
  return {
    state: initialState(),
    error: "הנתונים השמורים לא נקראו. האפליקציה פתוחה, בלי לדרוס אותם.",
    save: false,
  };
}

let saveProblem: string | null = null;
const saveListeners = new Set<() => void>();

export function publishSaveResult(ok: boolean): void {
  const next = ok ? null : "לא הצלחתי לשמור על המכשיר.";
  if (next === saveProblem) return;
  saveProblem = next;
  saveListeners.forEach((listener) => listener());
}

export function subscribeSaveProblem(listener: () => void): () => void {
  saveListeners.add(listener);
  return () => saveListeners.delete(listener);
}

export function readSaveProblem(): string | null {
  return saveProblem;
}

export function serializeState(state: AppState): Persisted {
  return {
    version: 2,
    settings: state.settings,
    engine: state.engine,
    sessions: state.sessions,
    tasks: state.tasks,
    activeTaskId: state.activeTaskId,
  };
}

export function saveState(state: AppState): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(serializeState(state)));
    return true;
  } catch {
    return false;
  }
}
