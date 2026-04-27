"use client";

import { useEffect, useState } from "react";

interface CountdownTimerProps {
  endsAt: string; // ISO string
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

  const totalSeconds = Math.max(
    1,
    Math.floor((new Date(endsAt).getTime() - Date.now()) / 1000) + secondsLeft
  );

  const pct = (secondsLeft / 60) * 100; // assume 60s default
  const isLow = secondsLeft <= 10;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="section-label">Time remaining</span>
        <span
          className={`font-display text-2xl ${
            isLow ? "text-red-400 animate-pulse-fast" : "text-paper"
          }`}
        >
          {secondsLeft}s
        </span>
      </div>
      <div className="stat-bar-track h-2">
        <div
          className={`h-full transition-none ${isLow ? "bg-red-500" : "bg-accent"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
