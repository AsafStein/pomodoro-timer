"use client";

import { useEffect, useReducer, useRef, useState, useSyncExternalStore } from "react";
import { RotateCcw, SkipForward } from "lucide-react";
import { InstallCard, InstallDialog, useInstallState } from "@/components/install-dialog";
import { SettingsDialog } from "@/components/settings-dialog";
import { TimerRing } from "@/components/timer-ring";
import { Button } from "@/components/ui/button";
import {
  durationMs,
  formatClock,
  type Mode,
  type Phase,
  type Settings,
} from "@/lib/engine";
import {
  ensureNotificationPermission,
  notify,
  playChime,
  registerServiceWorker,
  setWakeLock,
  unlockAudio,
} from "@/lib/feedback";
import { formatMinutes, formatStreak, greeting, modeLabel, sessionsOnDay, weekFocus, focusStreak } from "@/lib/stats";
import { initialState, reduce } from "@/lib/store";
import {
  bootFromRaw,
  publishSaveResult,
  readPersistedRaw,
  readSaveProblem,
  sanitizeSettings,
  saveState,
  subscribePersisted,
  subscribeSaveProblem,
} from "@/lib/storage";
import { cn } from "@/lib/utils";

const MODES: Mode[] = ["focus", "short", "long"];

const MODE_SHORT: Record<Mode, string> = {
  focus: "מיקוד",
  short: "קצרה",
  long: "ארוכה",
};

const STATUS: Record<Phase, string> = {
  idle: "מוכן",
  running: "רץ",
  paused: "מושהה",
};

const EMPTY_WEEK = Array.from({ length: 7 }, (_, index) => ({
  key: `empty-${index}`,
  label: "·",
  minutes: 0,
  isToday: false,
}));

function subscribeOnline(listener: () => void) {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}

export function PomodoroApp() {
  const raw = useSyncExternalStore(subscribePersisted, readPersistedRaw, () => null);
  const saveProblem = useSyncExternalStore(subscribeSaveProblem, readSaveProblem, () => null);
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const [state, dispatch] = useReducer(reduce, undefined, initialState);
  const [bootedFrom, setBootedFrom] = useState<string | null>(null);
  const [storageNote, setStorageNote] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const allowSave = useRef(false);
  const install = useInstallState();
  const ready = bootedFrom !== null;

  if (raw !== null && bootedFrom === null) {
    const tick = Date.now();
    const booted = bootFromRaw(raw, tick);
    allowSave.current = booted.save;
    setBootedFrom(raw);
    setNow(tick);
    if (booted.error) setStorageNote(booted.error);
    dispatch({ type: "hydrate", state: booted.state });
  }

  useEffect(() => {
    registerServiceWorker();
  }, []);

  useEffect(() => {
    if (!ready || !allowSave.current) return;
    publishSaveResult(saveState(state));
  }, [ready, state]);

  useEffect(() => {
    if (!ready || state.engine.phase !== "running") return;
    const id = window.setInterval(() => {
      const tick = Date.now();
      setNow(tick);
      dispatch({ type: "tick", now: tick });
    }, 200);
    return () => window.clearInterval(id);
  }, [ready, state.engine.phase]);

  useEffect(() => {
    if (!ready) return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const tick = Date.now();
      setNow(tick);
      dispatch({ type: "tick", now: tick });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    const enabled = state.settings.wakeLock && state.engine.phase === "running";
    void setWakeLock(enabled);
    if (!enabled) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void setWakeLock(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void setWakeLock(false);
    };
  }, [ready, state.settings.wakeLock, state.engine.phase]);

  useEffect(() => {
    const notice = state.notice;
    if (!ready || !notice) return;
    if (Date.now() - notice.at > 15_000) return;
    if (notice.sound) playChime();
    if (notice.notifications) void notify("ריכוז", notice.text);
    navigator.vibrate?.([30, 40, 30, 40, 80]);
  }, [ready, state.notice]);

  useEffect(() => {
    if (!state.notice) return;
    const id = window.setTimeout(() => dispatch({ type: "dismiss-notice" }), 8000);
    return () => window.clearTimeout(id);
  }, [state.notice]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.code !== "Space" || event.repeat) return;
      if (document.querySelector('[role="dialog"]')) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON" || target?.isContentEditable) return;
      event.preventDefault();
      onPrimary();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    if (!ready) return;
    document.title =
      state.engine.phase === "running"
        ? `${formatClock(state.engine.remainingMs)} · ריכוז`
        : "ריכוז";
  }, [ready, state.engine.phase, state.engine.remainingMs]);

  function updateSettings(patch: Partial<Settings>) {
    dispatch({
      type: "settings",
      settings: sanitizeSettings({ ...state.settings, ...patch }),
    });
  }

  function onPrimary() {
    const tick = Date.now();
    if (state.engine.phase === "running") {
      dispatch({ type: "pause", now: tick });
      return;
    }
    unlockAudio();
    if (state.settings.notifications) void ensureNotificationPermission();
    dispatch({ type: "start", now: tick });
  }

  const engine = state.engine;
  const remaining = ready ? engine.remainingMs : 25 * 60 * 1000;
  const total = ready ? durationMs(state.settings, engine.mode) : 25 * 60 * 1000;

  const message = storageNote ?? saveProblem;
  const offline = !online;
  const todayFocus = now == null ? [] : sessionsOnDay(state.sessions, now, "focus");
  const todayAll = now == null ? [] : sessionsOnDay(state.sessions, now);
  const focusMinutes = todayFocus.reduce((sum, session) => sum + session.durationMs, 0) / 60_000;
  const streak = now == null ? 0 : focusStreak(state.sessions, now);
  const week = now == null ? EMPTY_WEEK : weekFocus(state.sessions, now);
  const weekMax = Math.max(25, ...week.map((day) => day.minutes));
  const goalRatio = Math.min(1, todayFocus.length / state.settings.dailyGoal);
  const minuteMark = Math.ceil(remaining / 60_000);

  return (
    <div
      data-mode={engine.mode}
      data-running={engine.phase === "running" ? "true" : "false"}
      aria-busy={!ready}
      className="relative mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(ellipse_at_top,color-mix(in_oklch,var(--mode)_24%,transparent),transparent_68%)]" />
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-background/75 py-3 backdrop-blur-md pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div>
          <p className="text-xs tracking-wide text-muted-foreground">פומודורו אישי</p>
          <h1 className="text-2xl font-medium tracking-tight">
            {ready && now != null ? greeting(state.settings.name, new Date(now)) : "ריכוז"}
          </h1>
        </div>
        <div className="flex items-center">
          <InstallDialog canPrompt={install.canPrompt} onInstall={() => void install.install()} />
          <SettingsDialog
            settings={state.settings}
            onChange={updateSettings}
            onClear={() => dispatch({ type: "clear-history" })}
          />
        </div>
      </header>

      {offline ? (
        <p className="relative mb-3 rounded-xl bg-card px-3 py-2 text-sm text-muted-foreground" role="status">
          אין רשת. הטיימר ממשיך על המכשיר.
        </p>
      ) : null}
      {message ? (
        <p className="relative mb-3 rounded-xl bg-destructive/10 px-3 py-2 text-sm" role="alert">
          {message}
        </p>
      ) : null}

      <div className="relative grid flex-1 gap-8 pb-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-center lg:gap-12">
        <section className="flex flex-col items-center gap-6" aria-label="טיימר">
          <div
            className="grid w-full max-w-sm grid-cols-3 gap-1 rounded-full bg-muted p-1"
            role="tablist"
            aria-label="סוג סשן"
          >
            {MODES.map((mode) => {
              const selected = engine.mode === mode;
              return (
                <Button
                  key={mode}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  variant={selected ? "default" : "ghost"}
                  disabled={!ready || (engine.phase === "running" && !selected)}
                  className={cn(
                    "h-11 rounded-full",
                    selected && "bg-[var(--mode)] text-[#1c1612] hover:bg-[var(--mode)]",
                  )}
                  onClick={() => dispatch({ type: "mode", mode })}
                >
                  {MODE_SHORT[mode]}
                </Button>
              );
            })}
          </div>

          <TimerRing
            remainingMs={remaining}
            durationMs={total}
            label={modeLabel(engine.mode)}
            status={ready ? STATUS[engine.phase] : "טוען"}
            loading={!ready}
          />
          <p className="sr-only" aria-live="polite">
            {modeLabel(engine.mode)}, {ready ? `${minuteMark} דקות נותרו` : "טוען"}
          </p>

          {state.notice ? (
            <p className="text-center text-sm text-[var(--mode)]" role="status">
              {state.notice.text}
            </p>
          ) : (
            <p className="text-center text-sm text-transparent" aria-hidden="true">
              מקום להודעה
            </p>
          )}

          <div className="flex w-full max-w-sm flex-col gap-3">
            <Button
              type="button"
              disabled={!ready}
              className="h-14 rounded-full bg-[var(--mode)] text-base font-semibold text-[#1c1612] hover:bg-[var(--mode)]/90"
              onClick={onPrimary}
            >
              {engine.phase === "running" ? "השהיה" : engine.phase === "paused" ? "המשך" : "התחלה"}
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-full"
                disabled={!ready}
                onClick={() => dispatch({ type: "skip", now: Date.now() })}
              >
                <SkipForward />
                דילוג
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-full"
                disabled={!ready || engine.phase === "idle"}
                onClick={() => dispatch({ type: "reset" })}
              >
                <RotateCcw />
                איפוס
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2" aria-label={`סבב, ${engine.cycleCount} מתוך ${state.settings.cycleLength}`}>
            {Array.from({ length: state.settings.cycleLength }, (_, index) => (
              <span
                key={index}
                className={cn(
                  "size-2.5 rounded-full",
                  index < engine.cycleCount ? "bg-[var(--mode)]" : "bg-foreground/15",
                )}
              />
            ))}
          </div>
          <p className="hidden text-xs text-muted-foreground md:block">רווח מפעיל ומשהה</p>
        </section>

        <aside className="flex flex-col gap-4">
          <section className="rounded-3xl border border-border bg-card/80 p-5">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="text-sm text-muted-foreground">היום</h2>
                <p className="mt-1 text-3xl font-medium tabular-nums">
                  {todayFocus.length}
                  <span className="text-base text-muted-foreground">/{state.settings.dailyGoal}</span>
                </p>
              </div>
              <p className="text-sm text-muted-foreground">{formatMinutes(focusMinutes)} ריכוז</p>
            </div>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-foreground/10" aria-hidden="true">
              <div className="h-full rounded-full bg-[var(--focus)]" style={{ width: `${goalRatio * 100}%` }} />
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{formatStreak(streak)}</p>
            {todayFocus.length >= state.settings.dailyGoal ? (
              <p className="mt-1 text-sm text-[var(--focus)]">היעד היומי הושלם</p>
            ) : null}
          </section>

          <section className="rounded-3xl border border-border bg-card/80 p-5">
            <h2 className="text-sm text-muted-foreground">השבוע</h2>
            <div className="mt-4 flex h-24 items-end gap-2">
              {week.map((day) => (
                <div key={day.key} className="flex flex-1 flex-col items-center gap-2">
                  <div className="flex h-16 w-full items-end">
                    <div
                      className={cn(
                        "w-full rounded-full",
                        day.minutes > 0 ? "bg-[var(--focus)]" : "bg-foreground/10",
                        day.isToday && day.minutes > 0 && "ring-2 ring-foreground/30",
                      )}
                      style={{ height: day.minutes > 0 ? `${Math.max(12, (day.minutes / weekMax) * 100)}%` : "4px" }}
                    />
                  </div>
                  <span className={cn("text-xs", day.isToday ? "text-foreground" : "text-muted-foreground")}>
                    {day.label}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-card/80 p-5">
            <h2 className="text-sm text-muted-foreground">סשנים היום</h2>
            {todayAll.length === 0 ? (
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                עדיין אין סשנים היום. הסשן הראשון מתחיל בלחיצה על התחלה.
              </p>
            ) : (
              <ul className="mt-3 flex max-h-52 flex-col gap-2 overflow-y-auto">
                {todayAll.map((session) => (
                  <li key={session.id} className="flex items-center justify-between gap-3 text-sm">
                    <span>{modeLabel(session.mode)}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {formatMinutes(session.durationMs / 60_000)} ·{" "}
                      {new Date(session.completedAt).toLocaleTimeString("he-IL", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <InstallCard
            visible={!install.standalone && !install.dismissed}
            onDismiss={install.dismiss}
          />
        </aside>
      </div>
    </div>
  );
}
