"use client";

import { useState } from "react";
import { Archive, ArchiveRestore, Check, Pencil, Plus, Trash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cleanTaskName, type WorkSession } from "@/lib/sessions";
import { formatDuration, formatPomodoros } from "@/lib/stats";
import { summarizeTasks, type Task, type TaskSort, type TaskSummary } from "@/lib/tasks";
import { cn } from "@/lib/utils";

type TasksViewProps = {
  tasks: Task[];
  sessions: WorkSession[];
  activeTaskId: string | null;
  onCreate: (name: string) => void;
  onRename: (taskId: string, name: string) => void;
  onArchive: (taskId: string) => void;
  onRestore: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  onSelect: (taskId: string | null) => void;
};

export function TasksView({
  tasks,
  sessions,
  activeTaskId,
  onCreate,
  onRename,
  onArchive,
  onRestore,
  onDelete,
  onSelect,
}: TasksViewProps) {
  const [draft, setDraft] = useState("");
  const [sort, setSort] = useState<TaskSort>("time");
  const list = summarizeTasks(tasks, sessions, sort);

  return (
    <section className="relative mx-auto flex w-full max-w-xl flex-col gap-4 pb-6" aria-label="משימות">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-medium tracking-tight">משימות</h2>
          <p className="mt-1 text-sm text-muted-foreground">זמן ריכוז ופומודורו שהושלמו, לכל משימה.</p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-10 shrink-0 rounded-full"
          aria-pressed={sort === "time"}
          aria-label={sort === "time" ? "ממוין לפי זמן. מעבר למיון לפי שם" : "ממוין לפי שם. מעבר למיון לפי זמן"}
          onClick={() => setSort((current) => (current === "time" ? "name" : "time"))}
        >
          {sort === "time" ? "לפי זמן" : "לפי שם"}
        </Button>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const name = cleanTaskName(draft);
          if (!name) return;
          onCreate(name);
          setDraft("");
        }}
      >
        <Input
          value={draft}
          maxLength={60}
          placeholder="משימה חדשה"
          aria-label="שם משימה חדשה"
          autoComplete="off"
          className="h-11 min-w-0 flex-1 text-base"
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button type="submit" className="h-11 rounded-full px-4" disabled={!cleanTaskName(draft)}>
          <Plus />
          הוספה
        </Button>
      </form>

      {list.active.length === 0 ? (
        <p className="rounded-3xl border border-border bg-card/80 p-5 text-sm leading-6 text-muted-foreground">
          אין משימות פעילות. אפשר להוסיף משימה ולשייך אליה את סשן הריכוז הבא.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {list.active.map((row) => (
            <TaskCard
              key={row.task.id}
              row={row}
              selected={row.task.id === activeTaskId}
              onSelect={() => onSelect(row.task.id)}
              onRename={(name) => onRename(row.task.id, name)}
              onArchive={() => onArchive(row.task.id)}
            />
          ))}
        </ul>
      )}

      {list.unassignedMs > 0 ? (
        <p className="text-sm leading-6 text-muted-foreground">
          יש גם {formatDuration(list.unassignedMs)} בלי משימה ({formatPomodoros(list.unassignedPomodoros)}).
        </p>
      ) : null}

      {list.archived.length > 0 ? (
        <details className="rounded-3xl border border-border bg-card/80 p-5">
          <summary className="cursor-pointer text-sm text-muted-foreground">
            ארכיון ({list.archived.length})
          </summary>
          <ul className="mt-4 flex flex-col gap-3">
            {list.archived.map((row) => (
              <ArchivedCard
                key={row.task.id}
                row={row}
                selected={row.task.id === activeTaskId}
                onRestore={() => onRestore(row.task.id)}
                onDelete={() => onDelete(row.task.id)}
              />
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function TaskCard({
  row,
  selected,
  onSelect,
  onRename,
  onArchive,
}: {
  row: TaskSummary;
  selected: boolean;
  onSelect: () => void;
  onRename: (name: string) => void;
  onArchive: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(row.task.name);

  function save() {
    const next = cleanTaskName(name);
    if (!next) return;
    onRename(next);
    setEditing(false);
  }

  return (
    <li className={cn("rounded-3xl border bg-card/80 p-4", selected ? "border-[var(--focus)]" : "border-border")}>
      {editing ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <Input
            value={name}
            maxLength={60}
            aria-label={`שם חדש ל${row.task.name}`}
            autoComplete="off"
            className="h-11 text-base"
            onChange={(event) => setName(event.target.value)}
          />
          <div className="flex gap-2">
            <Button type="submit" className="h-10 rounded-full" disabled={!cleanTaskName(name)}>
              שמירה
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-full"
              onClick={() => {
                setName(row.task.name);
                setEditing(false);
              }}
            >
              ביטול
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex items-start gap-2">
          <button type="button" className="min-w-0 flex-1 text-start" onClick={onSelect}>
            <span className="flex items-center gap-2">
              <span className="truncate text-base font-medium">{row.task.name}</span>
              {selected ? <Check className="size-4 shrink-0 text-[var(--focus)]" /> : null}
            </span>
            <span className="mt-1 block text-sm text-muted-foreground">
              {formatDuration(row.focusMs)} · {formatPomodoros(row.pomodoros)}
            </span>
            {selected ? <span className="mt-1 block text-xs text-[var(--focus)]">נבחרה לסשן</span> : null}
          </button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 rounded-full"
            aria-label={`שינוי שם, ${row.task.name}`}
            onClick={() => {
              setName(row.task.name);
              setEditing(true);
            }}
          >
            <Pencil />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 rounded-full"
            aria-label={`העברה לארכיון, ${row.task.name}`}
            onClick={onArchive}
          >
            <Archive />
          </Button>
        </div>
      )}
    </li>
  );
}

function ArchivedCard({
  row,
  selected,
  onRestore,
  onDelete,
}: {
  row: TaskSummary;
  selected: boolean;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const [confirm, setConfirm] = useState(false);

  return (
    <li className="rounded-2xl bg-background/40 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{row.task.name}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatDuration(row.focusMs)} · {formatPomodoros(row.pomodoros)}
          </p>
          {selected ? <p className="mt-1 text-xs text-[var(--focus)]">משויכת לסשן שרץ</p> : null}
        </div>
        <div className="flex shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 rounded-full"
            aria-label={`שחזור, ${row.task.name}`}
            onClick={onRestore}
          >
            <ArchiveRestore />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 rounded-full"
            aria-label={`מחיקה, ${row.task.name}`}
            onClick={() => setConfirm(true)}
          >
            <Trash />
          </Button>
        </div>
      </div>
      {confirm ? (
        <div className="mt-3 rounded-xl bg-destructive/10 p-3">
          <p className="text-sm leading-6">
            למחוק את {row.task.name}? הזמנים יישארו בדוחות תחת השם הזה.
          </p>
          <div className="mt-2 flex gap-2">
            <Button type="button" variant="destructive" className="h-10" onClick={onDelete}>
              מחיקה
            </Button>
            <Button type="button" variant="outline" className="h-10" onClick={() => setConfirm(false)}>
              ביטול
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
