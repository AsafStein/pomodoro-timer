"use client";

import { useState } from "react";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import type { Settings as TimerSettings } from "@/lib/engine";
import { cn } from "@/lib/utils";

const PRESETS = [
  { id: "classic", label: "קלאסי", focusMin: 25, shortMin: 5, longMin: 15 },
  { id: "deep", label: "עמוק", focusMin: 50, shortMin: 10, longMin: 20 },
  { id: "short", label: "קצר", focusMin: 15, shortMin: 3, longMin: 10 },
] as const;

type SettingsDialogProps = {
  settings: TimerSettings;
  onChange: (settings: Partial<TimerSettings>) => void;
  onClear: () => void;
};

export function SettingsDialog({ settings, onChange, onClear }: SettingsDialogProps) {
  const [confirmClear, setConfirmClear] = useState(false);

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) setConfirmClear(false);
      }}
    >
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon" className="size-11 rounded-full" aria-label="הגדרות" />
        }
      >
        <Settings />
      </DialogTrigger>
      <DialogContent className="flex max-h-[85dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle>הגדרות</DialogTitle>
          <DialogDescription>הכל נשמר רק על המכשיר הזה.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-6 overflow-y-auto px-5 pb-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="display-name">איך לקרוא לך</Label>
            <Input
              id="display-name"
              value={settings.name}
              maxLength={24}
              placeholder="אפשר להשאיר ריק"
              autoComplete="nickname"
              className="h-11 text-base"
              onChange={(event) => onChange({ name: event.target.value })}
            />
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">קצב</p>
            <div className="grid grid-cols-3 gap-2">
              {PRESETS.map((preset) => {
                const active =
                  settings.focusMin === preset.focusMin &&
                  settings.shortMin === preset.shortMin &&
                  settings.longMin === preset.longMin;
                return (
                  <Button
                    key={preset.id}
                    type="button"
                    variant={active ? "default" : "outline"}
                    className={cn("h-10", active && "bg-[var(--mode)] text-[#1c1612] hover:bg-[var(--mode)]")}
                    onClick={() =>
                      onChange({
                        focusMin: preset.focusMin,
                        shortMin: preset.shortMin,
                        longMin: preset.longMin,
                      })
                    }
                  >
                    {preset.label}
                  </Button>
                );
              })}
            </div>
          </div>

          <DurationSlider
            label="משך מיקוד"
            value={settings.focusMin}
            min={1}
            max={90}
            onChange={(focusMin) => onChange({ focusMin })}
          />
          <DurationSlider
            label="משך הפסקה"
            value={settings.shortMin}
            min={1}
            max={30}
            onChange={(shortMin) => onChange({ shortMin })}
          />
          <DurationSlider
            label="משך הפסקה ארוכה"
            value={settings.longMin}
            min={1}
            max={45}
            onChange={(longMin) => onChange({ longMin })}
          />
          <DurationSlider
            label="סשנים עד הפסקה ארוכה"
            value={settings.cycleLength}
            min={2}
            max={8}
            unit=""
            onChange={(cycleLength) => onChange({ cycleLength })}
          />
          <DurationSlider
            label="יעד יומי"
            value={settings.dailyGoal}
            min={1}
            max={12}
            unit=" סשנים"
            onChange={(dailyGoal) => onChange({ dailyGoal })}
          />

          <div className="flex flex-col gap-4">
            <Toggle
              id="auto-breaks"
              label="להתחיל הפסקה אוטומטית"
              description="מיד אחרי סשן מיקוד"
              checked={settings.autoStartBreaks}
              onCheckedChange={(autoStartBreaks) => onChange({ autoStartBreaks })}
            />
            <Toggle
              id="auto-focus"
              label="להתחיל מיקוד אוטומטית"
              description="מיד אחרי הפסקה"
              checked={settings.autoStartFocus}
              onCheckedChange={(autoStartFocus) => onChange({ autoStartFocus })}
            />
            <Toggle
              id="sound"
              label="צליל בסיום"
              description="פעמון קצר כשהסשן נגמר"
              checked={settings.sound}
              onCheckedChange={(sound) => onChange({ sound })}
            />
            <Toggle
              id="wake"
              label="להשאיר את המסך דלוק"
              description="בזמן שסשן רץ והאפליקציה פתוחה"
              checked={settings.wakeLock}
              onCheckedChange={(wakeLock) => onChange({ wakeLock })}
            />
            <Toggle
              id="notifications"
              label="התראה בסיום"
              description="באייפון, רק אחרי הוספה למסך הבית"
              checked={settings.notifications}
              onCheckedChange={(notifications) => onChange({ notifications })}
            />
          </div>

          <p className="text-xs leading-5 text-muted-foreground">
            כשהמסך נעול, האייפון עשוי להשהות את הדפדפן. הזמן מחושב לפי שעון אמיתי, וכשחוזרים
            לאפליקציה הסשן שרץ מושלם. סשנים שלא באמת רצו לא נספרים.
          </p>

          {confirmClear ? (
            <div className="flex flex-col gap-2 rounded-xl bg-destructive/10 p-3">
              <p className="text-sm">למחוק את כל היסטוריית הסשנים? אי אפשר לשחזר.</p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  className="h-10"
                  onClick={() => {
                    onClear();
                    setConfirmClear(false);
                  }}
                >
                  למחוק הכל
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10"
                  onClick={() => setConfirmClear(false)}
                >
                  ביטול
                </Button>
              </div>
            </div>
          ) : (
            <Button type="button" variant="ghost" className="h-10 self-start" onClick={() => setConfirmClear(true)}>
              מחיקת היסטוריה
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DurationSlider({
  label,
  value,
  min,
  max,
  unit = " דק׳",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <Label>{label}</Label>
        <span className="text-sm text-muted-foreground tabular-nums">
          {value}
          {unit}
        </span>
      </div>
      <Slider
        min={min}
        max={max}
        step={1}
        value={[value]}
        aria-label={label}
        onValueChange={(next) => {
          const resolved = Array.isArray(next) ? next[0] : next;
          if (typeof resolved === "number") onChange(resolved);
        }}
      />
    </div>
  );
}

function Toggle({
  id,
  label,
  description,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor={id}>{label}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
