let audio: AudioContext | null = null;
let wakeLock: WakeLockSentinel | null = null;

export function unlockAudio(): void {
  const Context = window.AudioContext;
  if (!Context) return;
  if (!audio) audio = new Context();
  if (audio.state === "suspended") void audio.resume();
}

export function playChime(): void {
  unlockAudio();
  if (!audio) return;
  const context = audio;
  const now = context.currentTime;
  [523.25, 659.25, 783.99].forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const startAt = now + index * 0.16;
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.07, startAt + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.55);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + 0.6);
  });
}

export async function setWakeLock(enabled: boolean): Promise<void> {
  if (!enabled) {
    const current = wakeLock;
    wakeLock = null;
    try {
      await current?.release();
    } catch {
      /* already released */
    }
    return;
  }
  if (wakeLock || !("wakeLock" in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => {
      wakeLock = null;
    });
  } catch {
    wakeLock = null;
  }
}

export async function ensureNotificationPermission(): Promise<void> {
  if (typeof Notification === "undefined" || Notification.permission !== "default") return;
  try {
    await Notification.requestPermission();
  } catch {
    /* permission prompt blocked */
  }
}

export async function notify(title: string, body: string): Promise<void> {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) {
      await registration.showNotification(title, {
        body,
        lang: "he",
        dir: "rtl",
        icon: "/icon",
      });
      return;
    }
  } catch {
    /* fall through to the page notification */
  }
  try {
    const notification = new Notification(title, { body, lang: "he", dir: "rtl" });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch {
    /* notifications are unavailable */
  }
}

export function registerServiceWorker(): void {
  if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
  void navigator.serviceWorker.register("/sw.js").catch(() => {
    /* offline support is optional */
  });
}
