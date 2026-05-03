"use client";

import { useEffect, useState } from "react";

interface CountdownTimerProps {
  endsAt: string;
  onExpired?: () => void;
}

export function CountdownTimer({ endsAt, onExpired }: CountdownTimerProps) {
  const [secondsLeft, setSecondsLeft] = useState<number>(0);

  useEffect(() => {
    function tick() {
      const diff = Math.max(
        0,
        Math.floor((new Date(endsAt).getTime() - Date.now()) / 1000)
      );
      setSecondsLeft(diff);
      if (diff <= 0) onExpired?.();
    }
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [endsAt, onExpired]);

  const isLow = secondsLeft <= 10;
  const pct = Math.min(100, (secondsLeft / 60) * 100);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="live-dot" />
          <span className="section-label">Time remaining</span>
        </div>
        <span
          className={`font-display text-2xl tabular-nums transition-colors duration-200 ${
            isLow ? "text-accent animate-pulse-fast" : "text-paper"
          }`}
          style={isLow ? { textShadow: "0 0 12px rgba(232,64,28,0.6)" } : undefined}
        >
          {secondsLeft}s
        </span>
      </div>
      <div className="stat-bar-track h-1.5">
        <div
          className={`h-full transition-none ${isLow ? "bg-accent" : "bg-accent/60"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
