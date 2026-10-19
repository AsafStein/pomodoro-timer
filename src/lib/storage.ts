import {
  defaultSettings,
  durationMs,
  type Engine,
  type FinishedSession,
  type Mode,
  type Phase,
  type Settings,
} from "./engine";
import { initialState, reduce, type AppState } from "./store";

const KEY = "rikuz-v1";
const UNAVAILABLE = "unavailable";

export type BootResult = {
  state: AppState;
  error: string | null;
  save: boolean;
};

type Persisted = {
  version: 1;
  settings: Settings;
  engine: Engine;
  sessions: FinishedSession[];
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
    return { mode, phase: "idle", remainingMs: duration, endsAt: null, cycleCount };
  }
  return {
    mode,
    phase,
    remainingMs: remaining,
    endsAt: phase === "running" ? endsAt : null,
    cycleCount,
  };
}

function sanitizeSessions(value: unknown): FinishedSession[] {
  if (!Array.isArray(value)) return [];
  const sessions: FinishedSession[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Partial<FinishedSession>;
    if (typeof row.id !== "string" || typeof row.completedAt !== "number") continue;
    if (row.mode !== "focus" && row.mode !== "short" && row.mode !== "long") continue;
    if (typeof row.durationMs !== "number" || row.durationMs <= 0) continue;
    sessions.push({
      id: row.id,
      mode: row.mode,
      durationMs: row.durationMs,
      completedAt: row.completedAt,
    });
  }
  return sessions.slice(0, 100);
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
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    if (parsed.version !== 1) return { status: "invalid" };
    const settings = sanitizeSettings(parsed.settings);
    return {
      status: "ok",
      state: {
        settings,
        engine: sanitizeEngine(parsed.engine, settings),
        sessions: sanitizeSessions(parsed.sessions),
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

export function saveState(state: AppState): boolean {
  try {
    const payload: Persisted = {
      version: 1,
      settings: state.settings,
      engine: state.engine,
      sessions: state.sessions,
    };
    localStorage.setItem(KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}
