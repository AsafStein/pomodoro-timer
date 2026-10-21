"use client";

import { useMemo, useState } from "react";
import { Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cleanTaskName } from "@/lib/sessions";
import type { Task } from "@/lib/tasks";
import { cn } from "@/lib/utils";

type TaskPickerProps = {
  tasks: Task[];
  activeTaskId: string | null;
  disabled?: boolean;
  onSelect: (taskId: string | null) => void;
  onCreate: (name: string) => void;
};

export function TaskPicker({ tasks, activeTaskId, disabled, onSelect, onCreate }: TaskPickerProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const active = tasks.find((task) => task.id === activeTaskId) ?? null;
  const choices = useMemo(() => {
    const visible = tasks.filter((task) => task.archivedAt == null || task.id === activeTaskId);
    const needle = cleanTaskName(query);
    if (!needle) return visible;
    return visible.filter((task) => task.name.includes(needle));
  }, [tasks, activeTaskId, query]);

  function choose(taskId: string | null) {
    onSelect(taskId);
    setOpen(false);
  }

  function create() {
    const name = cleanTaskName(draft);
    if (!name) return;
    onCreate(name);
    setDraft("");
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        className="flex w-full max-w-sm items-center justify-between gap-3 rounded-2xl border border-border bg-card/80 px-4 py-3 text-start disabled:opacity-50"
        onClick={() => setOpen(true)}
      >
        <span className="min-w-0">
          <span className="block text-xs text-muted-foreground">המשימה בסשן</span>
          <span className="block truncate text-base font-medium">{active?.name ?? "בלי משימה"}</span>
        </span>
        <span className="shrink-0 text-sm text-muted-foreground">בחירה</span>
      </button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setDraft("");
            setQuery("");
          }
        }}
      >
        <DialogContent className="flex max-h-[85dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="px-5 pt-5 pb-3">
            <DialogTitle>משימה לסשן</DialogTitle>
            <DialogDescription>הפומודורו הנוכחי נשמר על המשימה שנבחרה.</DialogDescription>
          </DialogHeader>
          <form
            className="flex gap-2 px-5 pb-3"
            onSubmit={(event) => {
              event.preventDefault();
              create();
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
          {tasks.length > 6 ? (
            <div className="px-5 pb-3">
              <Input
                value={query}
                placeholder="חיפוש"
                aria-label="חיפוש משימה"
                autoComplete="off"
                className="h-11 text-base"
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
          ) : null}
          <div className="flex flex-col gap-1 overflow-y-auto px-3 pb-5" role="radiogroup" aria-label="בחירת משימה">
            <Choice
              selected={activeTaskId == null}
              label="בלי משימה"
              onClick={() => choose(null)}
            />
            {choices.length === 0 ? (
              <p className="px-2 py-3 text-sm text-muted-foreground">
                {tasks.length === 0 ? "אין משימות עדיין. אפשר ליצור אחת למעלה." : "אין משימות תואמות."}
              </p>
            ) : (
              choices.map((task) => (
                <Choice
                  key={task.id}
                  selected={task.id === activeTaskId}
                  label={task.name}
                  hint={task.archivedAt != null ? "בארכיון" : undefined}
                  onClick={() => choose(task.id)}
                />
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Choice({
  selected,
  label,
  hint,
  onClick,
}: {
  selected: boolean;
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className={cn(
        "flex min-h-11 items-center justify-between gap-3 rounded-2xl px-3 py-2 text-start",
        selected ? "bg-muted" : "hover:bg-muted/60",
      )}
      onClick={onClick}
    >
      <span className="min-w-0">
        <span className="block truncate text-base">{label}</span>
        {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
      </span>
      {selected ? <Check className="size-4 shrink-0 text-[var(--focus)]" /> : null}
    </button>
  );
}
