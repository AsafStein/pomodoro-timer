import {
  applySettings,
  createEngine,
  defaultSettings,
  elapsedInSegment,
  pause,
  reset,
  selectMode,
  skip,
  start,
  sync,
  type Engine,
  type Mode,
  type Settings,
} from "./engine";
import { modeLabel } from "./stats";
import { MIN_PARTIAL_MS, SESSION_LIMIT, TASK_LIMIT, cleanTaskName, sessionFromFinished, type WorkSession } from "./sessions";
import type { Task } from "./tasks";

export type Notice = {
  id: string;
  text: string;
  at: number;
  sound: boolean;
  notifications: boolean;
  vibrate?: boolean;
};

export type AppState = {
  settings: Settings;
  engine: Engine;
  sessions: WorkSession[];
  tasks: Task[];
  activeTaskId: string | null;
  notice: Notice | null;
};

export type Action =
  | { type: "hydrate"; state: AppState }
  | { type: "tick"; now: number }
  | { type: "start"; now: number }
  | { type: "pause"; now: number }
  | { type: "reset"; now: number }
  | { type: "skip"; now: number }
  | { type: "mode"; mode: Mode; now: number }
  | { type: "settings"; settings: Settings }
  | { type: "clear-history" }
  | { type: "dismiss-notice" }
  | { type: "select-task"; taskId: string | null }
  | { type: "create-task"; name: string; now: number; id?: string }
  | { type: "rename-task"; taskId: string; name: string }
  | { type: "archive-task"; taskId: string; now: number }
  | { type: "restore-task"; taskId: string }
  | { type: "delete-task"; taskId: string };

export function initialState(): AppState {
  return {
    settings: defaultSettings,
    engine: createEngine(defaultSettings),
    sessions: [],
    tasks: [],
    activeTaskId: null,
    notice: null,
  };
}

export function reduce(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "hydrate":
      return action.state;
    case "tick":
      return applyFinish(state, sync(state.engine, state.settings, action.now), action.now);
    case "start":
      return {
        ...state,
        engine: start(state.engine, action.now),
        notice: null,
      };
    case "pause":
      return { ...state, engine: pause(state.engine, action.now) };
    case "reset":
      return stopAnd(state, action.now, (stopped, saved) => ({
        ...stopped,
        engine: reset(state.engine, state.settings),
        notice: saved ? stopped.notice : null,
      }));
    case "skip":
      return stopAnd(state, action.now, (stopped) =>
        applyFinish(stopped, skip(state.engine, state.settings, action.now), action.now),
      );
    case "mode": {
      if (state.engine.phase === "running" || state.engine.mode === action.mode) return state;
      const leavingFocus = state.engine.mode === "focus";
      const base = leavingFocus ? recordPartial(state, action.now) : state;
      return {
        ...base,
        engine: selectMode(state.engine, state.settings, action.mode),
        notice: base === state ? null : partialNotice(base.sessions[0], action.now),
      };
    }
    case "settings":
      return {
        ...state,
        settings: action.settings,
        engine: applySettings(state.engine, action.settings),
      };
    case "clear-history":
      return { ...state, sessions: [] };
    case "dismiss-notice":
      return { ...state, notice: null };
    case "select-task": {
      if (action.taskId == null) return { ...state, activeTaskId: null };
      const task = state.tasks.find((item) => item.id === action.taskId);
      if (!task) return state;
      return { ...state, activeTaskId: task.id };
    }
    case "create-task": {
      const name = cleanTaskName(action.name);
      if (!name) return state;
      const id = action.id ?? createTaskId(action.now);
      if (state.tasks.some((task) => task.id === id)) return state;
      const task: Task = { id, name, createdAt: action.now, archivedAt: null };
      return {
        ...state,
        tasks: [task, ...state.tasks].slice(0, TASK_LIMIT),
        activeTaskId: id,
      };
    }
    case "rename-task": {
      const name = cleanTaskName(action.name);
      if (!name) return state;
      return {
        ...state,
        tasks: state.tasks.map((task) => (task.id === action.taskId ? { ...task, name } : task)),
      };
    }
    case "archive-task": {
      const keepSelection =
        state.activeTaskId === action.taskId &&
        state.engine.mode === "focus" &&
        state.engine.phase !== "idle";
      return {
        ...state,
        tasks: state.tasks.map((task) =>
          task.id === action.taskId ? { ...task, archivedAt: task.archivedAt ?? action.now } : task,
        ),
        activeTaskId: state.activeTaskId === action.taskId && !keepSelection ? null : state.activeTaskId,
      };
    }
    case "restore-task":
      return {
        ...state,
        tasks: state.tasks.map((task) => (task.id === action.taskId ? { ...task, archivedAt: null } : task)),
      };
    case "delete-task":
      return {
        ...state,
        tasks: state.tasks.filter((task) => task.id !== action.taskId),
        activeTaskId: state.activeTaskId === action.taskId ? null : state.activeTaskId,
      };
    default:
      return state;
  }
}

function createTaskId(now: number): string {
  const rand = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `task-${now}-${rand}`;
}

function activeTask(state: AppState): Task | null {
  return state.tasks.find((task) => task.id === state.activeTaskId) ?? null;
}

function remember(state: AppState, session: WorkSession): AppState {
  if (state.sessions.some((item) => item.id === session.id)) return state;
  return { ...state, sessions: [session, ...state.sessions].slice(0, SESSION_LIMIT) };
}

function recordPartial(state: AppState, now: number): AppState {
  if (state.engine.mode !== "focus") return state;
  const elapsed = elapsedInSegment(state.engine, now);
  if (elapsed < MIN_PARTIAL_MS) return state;
  const task = activeTask(state);
  const startedAt = state.engine.segmentStartedAt ?? now - elapsed;
  const session: WorkSession = {
    id: `partial-${startedAt}-${now}`,
    mode: "focus",
    durationMs: elapsed,
    completedAt: now,
    startedAt,
    taskId: task?.id ?? null,
    taskName: task?.name ?? null,
    partial: true,
  };
  return remember(state, session);
}

function partialNotice(session: WorkSession | undefined, now: number): Notice {
  const where = session?.taskName ? ` על ${session.taskName}` : "";
  return {
    id: session?.id ?? `partial-note-${now}`,
    text: `זמן מיקוד חלקי נשמר${where}.`,
    at: now,
    sound: false,
    notifications: false,
    vibrate: false,
  };
}

function stopAnd(
  state: AppState,
  now: number,
  next: (stopped: AppState, saved: boolean) => AppState,
): AppState {
  const stopped = recordPartial(state, now);
  const saved = stopped !== state;
  const withNote = saved ? { ...stopped, notice: partialNotice(stopped.sessions[0], now) } : stopped;
  return next(withNote, saved);
}

function applyFinish(
  state: AppState,
  result: ReturnType<typeof sync>,
  now: number,
): AppState {
  const finished = result.finished;
  if (!finished || state.sessions.some((session) => session.id === finished.id)) {
    return { ...state, engine: result.engine };
  }
  const late = now - finished.completedAt > 2000;
  const label = modeLabel(finished.mode);
  const text = late
    ? finished.mode === "focus"
      ? "סשן המיקוד הסתיים בזמן שהמסך היה סגור."
      : `${label} נגמרה בזמן שהמסך היה סגור.`
    : finished.mode === "focus"
      ? "סשן הריכוז הושלם."
      : `${label} נגמרה.`;
  const startedAt = state.engine.segmentStartedAt ?? finished.completedAt - finished.durationMs;
  const task = finished.mode === "focus" ? activeTask(state) : null;
  const session = sessionFromFinished(finished, startedAt, task ? { id: task.id, name: task.name } : null);
  return {
    ...remember(state, session),
    engine: result.engine,
    notice: {
      id: finished.id,
      text,
      at: finished.completedAt,
      sound: state.settings.sound,
      notifications: state.settings.notifications,
    },
  };
}
