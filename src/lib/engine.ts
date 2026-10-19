export type Mode = "focus" | "short" | "long";
export type Phase = "idle" | "running" | "paused";

export type Settings = {
  name: string;
  focusMin: number;
  shortMin: number;
  longMin: number;
  cycleLength: number;
  dailyGoal: number;
  autoStartBreaks: boolean;
  autoStartFocus: boolean;
  sound: boolean;
  wakeLock: boolean;
  notifications: boolean;
};

export type Engine = {
  mode: Mode;
  phase: Phase;
  remainingMs: number;
  endsAt: number | null;
  cycleCount: number;
};

export type FinishedSession = {
  id: string;
  mode: Mode;
  durationMs: number;
  completedAt: number;
};

export type FinishResult = {
  engine: Engine;
  finished: FinishedSession | null;
};

export const defaultSettings: Settings = {
  name: "",
  focusMin: 25,
  shortMin: 5,
  longMin: 15,
  cycleLength: 4,
  dailyGoal: 4,
  autoStartBreaks: true,
  autoStartFocus: false,
  sound: true,
  wakeLock: true,
  notifications: true,
};

/** A completion this close to the clock still counts as happening live. */
export const LIVE_GRACE_MS = 2000;

export function durationMs(settings: Settings, mode: Mode): number {
  const minutes =
    mode === "focus"
      ? settings.focusMin
      : mode === "short"
        ? settings.shortMin
        : settings.longMin;
  return minutes * 60 * 1000;
}

export function createEngine(settings: Settings): Engine {
  return {
    mode: "focus",
    phase: "idle",
    remainingMs: durationMs(settings, "focus"),
    endsAt: null,
    cycleCount: 0,
  };
}

export function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000 - 1e-6));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function start(engine: Engine, now: number): Engine {
  if (engine.phase === "running") return engine;
  return {
    ...engine,
    phase: "running",
    endsAt: now + engine.remainingMs,
  };
}

export function pause(engine: Engine, now: number): Engine {
  if (engine.phase !== "running" || engine.endsAt == null) return engine;
  return {
    ...engine,
    phase: "paused",
    remainingMs: Math.max(0, engine.endsAt - now),
    endsAt: null,
  };
}

export function reset(engine: Engine, settings: Settings): Engine {
  return {
    ...engine,
    phase: "idle",
    endsAt: null,
    remainingMs: durationMs(settings, engine.mode),
  };
}

export function selectMode(engine: Engine, settings: Settings, mode: Mode): Engine {
  if (engine.phase === "running" || engine.mode === mode) return engine;
  const cycleCount =
    engine.mode === "long" && mode === "focus" ? 0 : engine.cycleCount;
  return {
    ...engine,
    mode,
    phase: "idle",
    endsAt: null,
    remainingMs: durationMs(settings, mode),
    cycleCount,
  };
}

export function applySettings(engine: Engine, settings: Settings): Engine {
  const cycleCount = Math.min(engine.cycleCount, settings.cycleLength);
  if (engine.phase !== "idle") return { ...engine, cycleCount };
  return {
    ...engine,
    cycleCount,
    remainingMs: durationMs(settings, engine.mode),
    endsAt: null,
  };
}

export function skip(engine: Engine, settings: Settings, now: number): FinishResult {
  return advance(engine, settings, now, now, false, true);
}

export function sync(engine: Engine, settings: Settings, now: number): FinishResult {
  if (engine.phase !== "running" || engine.endsAt == null) {
    return { engine, finished: null };
  }
  const drift = now - engine.endsAt;
  if (drift < 0) {
    return {
      engine: { ...engine, remainingMs: engine.endsAt - now },
      finished: null,
    };
  }
  return advance(engine, settings, engine.endsAt, now, true, drift < LIVE_GRACE_MS);
}

function advance(
  engine: Engine,
  settings: Settings,
  completedAt: number,
  now: number,
  countIt: boolean,
  live: boolean,
): FinishResult {
  let finished: FinishedSession | null = null;
  let cycleCount = engine.cycleCount;
  let nextMode: Mode = "focus";

  if (engine.mode === "focus") {
    if (countIt) {
      finished = session("focus", completedAt, settings);
      cycleCount += 1;
    }
    nextMode = cycleCount >= settings.cycleLength ? "long" : "short";
  } else if (engine.mode === "long") {
    if (countIt) finished = session("long", completedAt, settings);
    nextMode = "focus";
    cycleCount = 0;
  } else {
    if (countIt) finished = session("short", completedAt, settings);
    nextMode = "focus";
  }

  const auto =
    live && (nextMode === "focus" ? settings.autoStartFocus : settings.autoStartBreaks);
  const dur = durationMs(settings, nextMode);
  const endsAt = auto ? completedAt + dur : null;
  const remainingMs = endsAt == null ? dur : Math.max(0, endsAt - now);
  const running = auto && remainingMs > 0;

  return {
    finished,
    engine: {
      mode: nextMode,
      phase: running ? "running" : "idle",
      remainingMs: running ? remainingMs : dur,
      endsAt: running ? endsAt : null,
      cycleCount,
    },
  };
}

function session(mode: Mode, completedAt: number, settings: Settings): FinishedSession {
  return {
    id: `${mode}-${completedAt}`,
    mode,
    durationMs: durationMs(settings, mode),
    completedAt,
  };
}
