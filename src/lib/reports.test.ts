import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createEngine, defaultSettings, elapsedInSegment, start, pause } from "./engine";
import { buildReport, periodBounds, shiftAnchor } from "./reports";
import { formatDuration, formatPomodoros } from "./stats";
import { initialState, reduce } from "./store";
import { bootFromRaw, serializeState } from "./storage";
import { summarizeTasks } from "./tasks";

const focusSettings = { ...defaultSettings, autoStartBreaks: false, autoStartFocus: false };

function at(year: number, month: number, day: number, hour = 12, minute = 0): number {
  return new Date(year, month - 1, day, hour, minute, 0, 0).getTime();
}

describe("formatDuration", () => {
  it("keeps short focus readable and rounds hours in Hebrew", () => {
    assert.equal(formatDuration(0), "0 דקות");
    assert.equal(formatDuration(20_000), "20 שניות");
    assert.equal(formatDuration(25 * 60_000), "25 דקות");
    assert.equal(formatDuration(60 * 60_000), "שעה");
    assert.equal(formatDuration(2 * 60 * 60_000), "שעתיים");
    assert.equal(formatDuration(3 * 60 * 60_000 + 15 * 60_000), "3 שעות ו־15 דקות");
    assert.equal(formatPomodoros(0), "אין פומודורו");
    assert.equal(formatPomodoros(1), "פומודורו אחד");
    assert.equal(formatPomodoros(4), "4 פומודורו");
  });
});

describe("tasks and partial focus", () => {
  it("attributes a completed pomodoro to the selected task", () => {
    let state = reduce(initialState(), { type: "settings", settings: focusSettings });
    state = reduce(state, { type: "create-task", name: "  כתיבת דוח  ", now: 0, id: "write" });
    assert.equal(state.tasks[0]?.name, "כתיבת דוח");
    assert.equal(state.activeTaskId, "write");
    state = reduce(state, { type: "start", now: 1_000 });
    const end = state.engine.endsAt ?? 0;
    state = reduce(state, { type: "tick", now: end });
    assert.equal(state.sessions[0]?.partial, false);
    assert.equal(state.sessions[0]?.taskId, "write");
    assert.equal(state.sessions[0]?.taskName, "כתיבת דוח");
    assert.equal(state.sessions[0]?.startedAt, 1_000);
    assert.equal(state.sessions.filter((session) => session.mode === "focus").length, 1);
  });

  it("records partial focus on reset and skip, and ignores a short tap", () => {
    let state = reduce(initialState(), { type: "settings", settings: focusSettings });
    state = reduce(state, { type: "create-task", name: "קריאה", now: 0, id: "read" });
    state = reduce(state, { type: "start", now: 0 });
    const tapped = reduce(state, { type: "reset", now: 5_000 });
    assert.equal(tapped.sessions.length, 0);
    assert.equal(tapped.engine.phase, "idle");
    assert.equal(tapped.notice, null);

    state = reduce(state, { type: "reset", now: 20_000 });
    assert.equal(state.sessions.length, 1);
    assert.equal(state.sessions[0]?.partial, true);
    assert.equal(state.sessions[0]?.durationMs, 20_000);
    assert.equal(state.sessions[0]?.taskId, "read");
    assert.equal(state.engine.phase, "idle");
    assert.match(state.notice?.text ?? "", /חלקי/);
    assert.equal(state.notice?.sound, false);

    state = reduce(state, { type: "start", now: 30_000 });
    state = reduce(state, { type: "skip", now: 50_000 });
    assert.equal(state.sessions.filter((session) => session.partial).length, 2);
    assert.equal(state.engine.mode, "short");
    assert.equal(state.sessions.filter((session) => !session.partial && session.mode === "focus").length, 0);
  });

  it("keeps elapsed time across pause and saves it when leaving focus", () => {
    const engine = pause(start(createEngine(focusSettings), 0), 10_000);
    const resumed = start(engine, 25_000);
    assert.equal(resumed.segmentStartedAt, 0);
    assert.equal(elapsedInSegment(resumed, 35_000), 20_000);

    let state = reduce(initialState(), { type: "settings", settings: focusSettings });
    state = reduce(state, { type: "create-task", name: "עומק", now: 0, id: "deep" });
    state = reduce(state, { type: "start", now: 0 });
    state = reduce(state, { type: "pause", now: 20_000 });
    state = reduce(state, { type: "mode", mode: "short", now: 40_000 });
    assert.equal(state.sessions[0]?.durationMs, 20_000);
    assert.equal(state.sessions[0]?.partial, true);
    assert.equal(state.engine.mode, "short");
  });

  it("renames, archives, restores, and deletes without dropping recorded time", () => {
    let state = reduce(initialState(), { type: "settings", settings: focusSettings });
    state = reduce(state, { type: "create-task", name: "טיוטה", now: 1, id: "draft" });
    state = reduce(state, { type: "start", now: 1_000 });
    state = reduce(state, { type: "tick", now: state.engine.endsAt ?? 0 });
    state = reduce(state, { type: "rename-task", taskId: "draft", name: "גרסה סופית" });
    assert.equal(state.tasks[0]?.name, "גרסה סופית");
    assert.equal(state.sessions[0]?.taskId, "draft");

    state = reduce(state, { type: "archive-task", taskId: "draft", now: 9 });
    assert.equal(state.tasks[0]?.archivedAt, 9);
    assert.equal(state.activeTaskId, null);
    state = reduce(state, { type: "restore-task", taskId: "draft" });
    assert.equal(state.tasks[0]?.archivedAt, null);

    state = reduce(state, { type: "mode", mode: "focus", now: 40_000 });
    state = reduce(state, { type: "select-task", taskId: "draft" });
    state = reduce(state, { type: "start", now: 50_000 });
    state = reduce(state, { type: "archive-task", taskId: "draft", now: 60_000 });
    assert.equal(state.activeTaskId, "draft");

    state = reduce(state, { type: "delete-task", taskId: "draft" });
    assert.equal(state.tasks.length, 0);
    assert.equal(state.activeTaskId, null);
    assert.equal(state.sessions[0]?.taskName, "טיוטה");
    const report = buildReport(state.sessions, state.tasks, "day", state.sessions[0]?.completedAt ?? 0);
    assert.equal(report.breakdown[0]?.name, "טיוטה");
    assert.equal(report.pomodoros, 1);
  });

  it("sorts tasks by accumulated focus time and keeps unassigned history visible", () => {
    let state = reduce(initialState(), { type: "settings", settings: focusSettings });
    state = reduce(state, { type: "create-task", name: "קצרה", now: 1, id: "short-task" });
    state = reduce(state, { type: "start", now: 0 });
    state = reduce(state, { type: "reset", now: 20_000 });
    state = reduce(state, { type: "create-task", name: "ארוכה", now: 2, id: "long-task" });
    state = reduce(state, { type: "start", now: 30_000 });
    state = reduce(state, { type: "tick", now: state.engine.endsAt ?? 0 });
    const after = (state.engine.endsAt ?? 0) + 1_000;
    state = reduce(state, { type: "mode", mode: "focus", now: after });
    state = reduce(state, { type: "select-task", taskId: null });
    state = reduce(state, { type: "start", now: after });
    state = reduce(state, { type: "tick", now: state.engine.endsAt ?? 0 });

    const list = summarizeTasks(state.tasks, state.sessions, "time");
    assert.deepEqual(
      list.active.map((row) => row.task.id),
      ["long-task", "short-task"],
    );
    assert.equal(list.active[0]?.pomodoros, 1);
    assert.equal(list.active[1]?.pomodoros, 0);
    assert.ok(list.active[1] && list.active[1].focusMs >= 20_000);
    assert.equal(list.unassignedPomodoros, 1);
    assert.deepEqual(
      summarizeTasks(state.tasks, state.sessions, "name").active.map((row) => row.task.name),
      ["ארוכה", "קצרה"],
    );
  });

  it("rejects an empty name and does not clear tasks with history", () => {
    let state = reduce(initialState(), { type: "create-task", name: "   ", now: 1, id: "nope" });
    assert.equal(state.tasks.length, 0);
    state = reduce(state, { type: "create-task", name: "נשארת", now: 2, id: "keep" });
    state = reduce(state, { type: "clear-history" });
    assert.equal(state.sessions.length, 0);
    assert.equal(state.tasks.length, 1);
  });
});

describe("migration", () => {
  it("reads version 1 history as completed unassigned focus and writes version 2", () => {
    const completedAt = at(2026, 10, 21, 9, 30);
    const raw = JSON.stringify({
      version: 1,
      settings: { ...defaultSettings, name: "נועה" },
      engine: {
        mode: "focus",
        phase: "paused",
        remainingMs: 20 * 60_000,
        endsAt: 123,
        cycleCount: 2,
      },
      sessions: [
        { id: "focus-old", mode: "focus", durationMs: 25 * 60_000, completedAt },
        { id: "bad", mode: "focus", durationMs: 0, completedAt },
      ],
    });
    const booted = bootFromRaw(raw, completedAt + 5_000);
    assert.equal(booted.save, true);
    assert.equal(booted.error, null);
    assert.equal(booted.state.settings.name, "נועה");
    assert.equal(booted.state.tasks.length, 0);
    assert.equal(booted.state.activeTaskId, null);
    assert.equal(booted.state.sessions.length, 1);
    assert.equal(booted.state.sessions[0]?.partial, false);
    assert.equal(booted.state.sessions[0]?.taskId, null);
    assert.equal(booted.state.sessions[0]?.startedAt, completedAt - 25 * 60_000);
    assert.equal(booted.state.engine.phase, "paused");
    assert.equal(booted.state.engine.endsAt, null);
    assert.equal(booted.state.engine.segmentBudgetMs, 25 * 60_000);
    assert.equal(booted.state.engine.cycleCount, 2);

    const report = buildReport(booted.state.sessions, booted.state.tasks, "day", completedAt);
    assert.equal(report.pomodoros, 1);
    assert.equal(report.focusMs, 25 * 60_000);
    assert.equal(report.breakdown[0]?.name, "בלי משימה");

    const withTask = reduce(booted.state, { type: "create-task", name: "שיעור", now: completedAt, id: "lesson" });
    const again = bootFromRaw(JSON.stringify(serializeState(withTask)), completedAt + 5_000);
    assert.equal(again.state.sessions[0]?.id, "focus-old");
    assert.equal(again.state.settings.name, "נועה");
    assert.equal(again.state.tasks[0]?.name, "שיעור");
    assert.equal(again.state.activeTaskId, "lesson");
    assert.equal(serializeState(again.state).version, 2);
  });

  it("does not replace unreadable data", () => {
    const broken = bootFromRaw("{", Date.now());
    assert.equal(broken.save, false);
    assert.match(broken.error ?? "", /לא נקראו/);
    const future = bootFromRaw(JSON.stringify({ version: 3, settings: defaultSettings }), Date.now());
    assert.equal(future.save, false);
  });
});

describe("reports", () => {
  it("starts the week on Sunday and can move between periods", () => {
    const anchor = at(2026, 10, 21, 15);
    const week = periodBounds("week", anchor);
    assert.equal(new Date(week.start).getDay(), 0);
    assert.equal(new Date(week.end).getDay(), 0);
    assert.ok(anchor >= week.start && anchor < week.end);

    const sundayMorning = week.start + 5 * 60_000;
    const previousSaturday = new Date(week.start);
    previousSaturday.setDate(previousSaturday.getDate() - 1);
    previousSaturday.setHours(23, 30, 0, 0);
    const midweek = new Date(week.start);
    midweek.setDate(midweek.getDate() + 3);
    midweek.setHours(15, 0, 0, 0);
    const mid = midweek.getTime();

    const sessions = [
      session("sun", sundayMorning, "plan"),
      session("sat", previousSaturday.getTime(), "plan"),
      session("wed", mid, "plan", true, 10 * 60_000),
    ];
    const tasks = [{ id: "plan", name: "תכנון", createdAt: 0, archivedAt: null }];
    const report = buildReport(sessions, tasks, "week", mid, mid);
    assert.equal(report.isCurrent, true);
    assert.equal(report.pomodoros, 1);
    assert.equal(report.focusMs, 25 * 60_000 + 10 * 60_000);
    assert.equal(report.partialMs, 10 * 60_000);
    assert.equal(report.chart.length, 7);
    assert.equal(report.chart[0]?.focusMs, 25 * 60_000);
    assert.equal(report.chart[0]?.isCurrent, false);
    assert.equal(report.chart[3]?.focusMs, 10 * 60_000);
    assert.equal(report.breakdown[0]?.pomodoros, 1);
    assert.equal(report.breakdown[0]?.focusMs, 35 * 60_000);

    const previous = buildReport(sessions, tasks, "week", shiftAnchor("week", mid, -1), mid);
    assert.equal(previous.isCurrent, false);
    assert.equal(previous.pomodoros, 1);
    assert.equal(previous.chart.length, 7);

    const month = buildReport(sessions, tasks, "month", mid, mid);
    assert.equal(new Date(month.start).getDate(), 1);
    assert.ok(month.pomodoros >= 1);
    assert.ok(month.chart.length >= 28 && month.chart.length <= 31);

    const day = buildReport(sessions, tasks, "day", mid, mid);
    assert.equal(day.pomodoros, 0);
    assert.equal(day.focusMs, 10 * 60_000);
    assert.equal(day.chart.length, 24);
    const nextDay = buildReport(sessions, [], "day", shiftAnchor("day", mid, 1), mid);
    assert.equal(nextDay.focusMs, 0);
    assert.equal(nextDay.isCurrent, false);
  });

  it("uses the renamed task in the breakdown and keeps a deleted name", () => {
    const when = at(2026, 10, 2, 11);
    const sessions = [session("a", when, "gone", false, 25 * 60_000, "שם ישן")];
    const renamed = buildReport(sessions, [{ id: "gone", name: "שם חדש", createdAt: 0, archivedAt: 5 }], "month", when);
    assert.equal(renamed.breakdown[0]?.name, "שם חדש");
    assert.equal(renamed.breakdown[0]?.archived, true);
    const deleted = buildReport(sessions, [], "month", when);
    assert.equal(deleted.breakdown[0]?.name, "שם ישן");
  });
});

function session(
  id: string,
  completedAt: number,
  taskId: string | null,
  partial = false,
  durationMs = 25 * 60_000,
  taskName: string | null = "תכנון",
) {
  return {
    id,
    mode: "focus" as const,
    durationMs,
    completedAt,
    startedAt: completedAt - durationMs,
    taskId,
    taskName,
    partial,
  };
}
