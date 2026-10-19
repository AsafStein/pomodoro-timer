import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createEngine,
  defaultSettings,
  durationMs,
  formatClock,
  pause,
  selectMode,
  skip,
  start,
  sync,
  type Settings,
} from "./engine";
import { focusStreak, sessionsOnDay } from "./stats";
import { initialState, reduce } from "./store";
import { sanitizeSettings } from "./storage";

const settings: Settings = {
  ...defaultSettings,
  autoStartBreaks: false,
  autoStartFocus: false,
};

describe("formatClock", () => {
  it("shows a full minute at the start and zero at the end", () => {
    assert.equal(formatClock(25 * 60 * 1000), "25:00");
    assert.equal(formatClock(0), "00:00");
    assert.equal(formatClock(1), "00:01");
  });
});

describe("timer", () => {
  it("pauses and resumes from the remaining time", () => {
    const running = start(createEngine(settings), 0);
    const paused = pause(running, 5_000);
    assert.equal(paused.phase, "paused");
    assert.equal(paused.remainingMs, durationMs(settings, "focus") - 5_000);
    const resumed = start(paused, 9_000);
    assert.equal(resumed.endsAt, 9_000 + paused.remainingMs);
  });

  it("counts a live focus session and offers a short break", () => {
    const running = start(createEngine(settings), 1_000);
    const end = running.endsAt ?? 0;
    const result = sync(running, settings, end + 200);
    assert.equal(result.finished?.mode, "focus");
    assert.equal(result.finished?.completedAt, end);
    assert.equal(result.engine.mode, "short");
    assert.equal(result.engine.phase, "idle");
  });

  it("auto-starts the break only when the timer finishes live", () => {
    const liveSettings = { ...settings, autoStartBreaks: true };
    const running = start(createEngine(liveSettings), 1_000);
    const end = running.endsAt ?? 0;
    const live = sync(running, liveSettings, end + 300);
    assert.equal(live.engine.mode, "short");
    assert.equal(live.engine.phase, "running");

    const late = sync(running, liveSettings, end + 30_000);
    assert.equal(late.finished?.mode, "focus");
    assert.equal(late.engine.mode, "short");
    assert.equal(late.engine.phase, "idle");
  });

  it("opens a long break after a full cycle and then returns to focus", () => {
    let engine = createEngine(settings);
    let now = 0;
    const landed: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      engine = selectMode(engine, settings, "focus");
      engine = start(engine, now);
      const end = engine.endsAt ?? now;
      const result = sync(engine, settings, end);
      landed.push(result.engine.mode);
      engine = result.engine;
      now = end + 1;
    }
    assert.deepEqual(landed, ["short", "short", "short", "long"]);
    assert.equal(engine.cycleCount, 4);

    engine = start(engine, now);
    const afterLong = sync(engine, settings, engine.endsAt ?? now);
    assert.equal(afterLong.engine.mode, "focus");
    assert.equal(afterLong.engine.cycleCount, 0);
  });

  it("does not record a skipped session", () => {
    const result = skip(start(createEngine(settings), 0), settings, 1_000);
    assert.equal(result.finished, null);
    assert.equal(result.engine.mode, "short");
  });
});

describe("history", () => {
  it("records one completion even if the clock is checked twice", () => {
    let state = reduce(initialState(), { type: "start", now: 0 });
    const end = state.engine.endsAt ?? 0;
    state = reduce(state, { type: "tick", now: end });
    state = reduce(state, { type: "tick", now: end + 1_000 });
    assert.equal(state.sessions.length, 1);
    assert.equal(state.sessions[0]?.mode, "focus");
  });

  it("counts a streak through today, and through yesterday if today is empty", () => {
    const today = new Date(2026, 9, 19, 12).getTime();
    const yesterday = new Date(2026, 9, 18, 12).getTime();
    const gap = new Date(2026, 9, 16, 12).getTime();
    const session = (id: string, at: number) => ({
      id,
      mode: "focus" as const,
      durationMs: 25 * 60_000,
      completedAt: at,
    });
    assert.equal(focusStreak([session("a", today), session("b", yesterday), session("c", gap)], today), 2);
    assert.equal(focusStreak([session("b", yesterday)], today), 1);
    assert.equal(sessionsOnDay([session("a", today)], today, "focus").length, 1);
  });

  it("clamps durations that fall outside the allowed range", () => {
    const sanitized = sanitizeSettings({ focusMin: 400, shortMin: 0, name: "נועה המאוד ארוכה מדי לשם" });
    assert.equal(sanitized.focusMin, 90);
    assert.equal(sanitized.shortMin, 1);
    assert.equal(sanitized.name.length, 24);
  });
});
