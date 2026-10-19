"use client";

import { useSyncExternalStore } from "react";
import { Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type InstallSnapshot = {
  standalone: boolean;
  dismissed: boolean;
  canPrompt: boolean;
};

const DISMISS_KEY = "rikuz-install-dismissed";
const SERVER_INSTALL: InstallSnapshot = {
  standalone: false,
  dismissed: true,
  canPrompt: false,
};

let promptEvent: BeforeInstallPromptEvent | null = null;
let cachedSnapshot = SERVER_INSTALL;
let cachedKey = "";
const listeners = new Set<() => void>();

function emit() {
  cachedKey = "";
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onPrompt = (event: Event) => {
    event.preventDefault();
    promptEvent = event as BeforeInstallPromptEvent;
    emit();
  };
  const media = window.matchMedia("(display-mode: standalone)");
  const onChange = () => emit();
  window.addEventListener("beforeinstallprompt", onPrompt);
  media.addEventListener("change", onChange);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("beforeinstallprompt", onPrompt);
    media.removeEventListener("change", onChange);
  };
}

function readInstall(): InstallSnapshot {
  const nav = navigator as Navigator & { standalone?: boolean };
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
  let dismissed = true;
  try {
    dismissed = localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    dismissed = true;
  }
  const key = `${standalone}|${dismissed}|${promptEvent != null}`;
  if (key === cachedKey) return cachedSnapshot;
  cachedKey = key;
  cachedSnapshot = { standalone, dismissed, canPrompt: promptEvent != null };
  return cachedSnapshot;
}

function dismissInstall() {
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    /* private mode can reject storage */
  }
  emit();
}

async function promptInstall() {
  if (!promptEvent) return;
  await promptEvent.prompt();
  promptEvent = null;
  emit();
}

export function useInstallState() {
  const snapshot = useSyncExternalStore(subscribe, readInstall, () => SERVER_INSTALL);
  return { ...snapshot, dismiss: dismissInstall, install: promptInstall };
}

export function InstallDialog({
  canPrompt,
  onInstall,
}: {
  canPrompt: boolean;
  onInstall: () => void;
}) {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="size-11 rounded-full"
            aria-label="הוספה לאייפון"
          />
        }
      >
        <Smartphone />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>גם מהאייפון</DialogTitle>
          <DialogDescription>
            מוסיפים את ריכוז למסך הבית, והיא נפתחת כמו אפליקציה. בלי חנות, בלי חשבון.
          </DialogDescription>
        </DialogHeader>
        <ol className="flex list-decimal flex-col gap-2 ps-5 text-sm leading-6">
          <li>פותחים את האתר בספארי.</li>
          <li>לוחצים על כפתור השיתוף, הריבוע עם החץ למעלה.</li>
          <li>גוללים ובוחרים «הוסף למסך הבית».</li>
          <li>לוחצים «הוסף». האייקון ייקרא ריכוז.</li>
        </ol>
        <p className="text-xs leading-5 text-muted-foreground">
          התראה כשהסשן נגמר זמינה באייפון רק אחרי ההוספה למסך הבית. אם המסך נעול, המערכת עלולה
          להציג אותה באיחור. הדקות עצמן לא הולכות לאיבוד.
        </p>
        {canPrompt ? (
          <Button type="button" className="h-11" onClick={onInstall}>
            התקנה במכשיר הזה
          </Button>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function InstallCard({
  visible,
  onDismiss,
}: {
  visible: boolean;
  onDismiss: () => void;
}) {
  if (!visible) return null;
  return (
    <section className="rounded-2xl border border-border bg-card/80 p-4">
      <h2 className="text-base font-medium">להוסיף לאייפון</h2>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        בספארי: שיתוף, ואז «הוסף למסך הבית». האפליקציה תיפתח במסך מלא.
      </p>
      <Button type="button" variant="ghost" className="mt-2 h-10 px-0" onClick={onDismiss}>
        הבנתי, אפשר להסתיר
      </Button>
    </section>
  );
}
