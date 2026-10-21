"use client";

import { ChartColumn, ListTodo, Timer } from "lucide-react";
import { cn } from "@/lib/utils";

export type AppView = "timer" | "tasks" | "reports";

const ITEMS: { id: AppView; label: string; icon: typeof Timer }[] = [
  { id: "timer", label: "טיימר", icon: Timer },
  { id: "tasks", label: "משימות", icon: ListTodo },
  { id: "reports", label: "דוחות", icon: ChartColumn },
];

type AppNavProps = {
  view: AppView;
  timerHint: string | null;
  onChange: (view: AppView) => void;
};

export function AppNav({ view, timerHint, onChange }: AppNavProps) {
  return (
    <nav
      aria-label="ניווט ראשי"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/90 backdrop-blur-md"
    >
      <div className="mx-auto grid w-full max-w-5xl grid-cols-3 gap-1 px-3 pt-1 pb-[max(0.35rem,env(safe-area-inset-bottom))]">
        {ITEMS.map((item) => {
          const active = view === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-2xl text-xs",
                active ? "bg-muted text-foreground" : "text-muted-foreground",
              )}
              onClick={() => onChange(item.id)}
            >
              <Icon className="size-5" />
              <span className="flex items-center gap-1 whitespace-nowrap">
                {item.label}
                {item.id === "timer" && timerHint ? (
                  <span dir="ltr" className="font-display text-[11px] tabular-nums">
                    {timerHint}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
