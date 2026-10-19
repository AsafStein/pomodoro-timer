import { formatClock } from "@/lib/engine";

type TimerRingProps = {
  remainingMs: number;
  durationMs: number;
  label: string;
  status: string;
  loading?: boolean;
};

export function TimerRing({ remainingMs, durationMs, label, status, loading }: TimerRingProps) {
  const size = 280;
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = durationMs <= 0 ? 0 : Math.min(1, Math.max(0, remainingMs / durationMs));
  const offset = circumference * (1 - ratio);

  return (
    <div className="relative mx-auto w-[min(78vw,320px)]">
      <div className="ring-glow pointer-events-none absolute inset-[14%] rounded-full bg-[var(--mode)] blur-3xl" />
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden="true"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-foreground/10"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--mode)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={loading ? circumference : offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 select-none">
        <p className="text-sm tracking-wide text-muted-foreground">{label}</p>
        <p
          dir="ltr"
          className="font-display text-[4.25rem] leading-none font-medium tracking-tight tabular-nums"
        >
          {loading ? "--:--" : formatClock(remainingMs)}
        </p>
        <p className="text-sm text-muted-foreground">{status}</p>
      </div>
    </div>
  );
}
