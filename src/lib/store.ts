import {
  applySettings,
  createEngine,
  defaultSettings,
  pause,
  reset,
  selectMode,
  skip,
  start,
  sync,
  type Engine,
  type FinishedSession,
  type Mode,
  type Settings,
} from "./engine";
import { modeLabel } from "./stats";

export type Notice = {
  id: string;
  text: string;
  at: number;
  sound: boolean;
  notifications: boolean;
};

export type AppState = {
  settings: Settings;
  engine: Engine;
  sessions: FinishedSession[];
  notice: Notice | null;
};

export type Action =
  | { type: "hydrate"; state: AppState }
  | { type: "tick"; now: number }
  | { type: "start"; now: number }
  | { type: "pause"; now: number }
  | { type: "reset" }
  | { type: "skip"; now: number }
  | { type: "mode"; mode: Mode }
  | { type: "settings"; settings: Settings }
  | { type: "clear-history" }
  | { type: "dismiss-notice" };

export function initialState(): AppState {
  return {
    settings: defaultSettings,
    engine: createEngine(defaultSettings),
    sessions: [],
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
      return {
        ...state,
        engine: reset(state.engine, state.settings),
        notice: null,
      };
    case "skip":
      return applyFinish(state, skip(state.engine, state.settings, action.now), action.now);
    case "mode":
      return {
        ...state,
        engine: selectMode(state.engine, state.settings, action.mode),
        notice: null,
      };
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
    default:
      return state;
  }
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
  return {
    ...state,
    engine: result.engine,
    sessions: [finished, ...state.sessions].slice(0, 100),
    notice: {
      id: finished.id,
      text,
      at: finished.completedAt,
      sound: state.settings.sound,
      notifications: state.settings.notifications,
    },
  };
}
