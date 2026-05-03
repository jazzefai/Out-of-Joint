"use client";

import { useEffect, useRef, useState } from "react";

interface ParticipationMeterProps {
  voted: number;
  total: number;
  label?: string;
}

export function ParticipationMeter({ voted, total, label }: ParticipationMeterProps) {
  const pct = total > 0 ? (voted / total) * 100 : 0;
  const allIn = voted >= total && total > 0;
  const [flashing, setFlashing] = useState(false);
  const prevAllIn = useRef(false);

  useEffect(() => {
    if (allIn && !prevAllIn.current) {
      setFlashing(true);
      const t = setTimeout(() => setFlashing(false), 900);
      return () => clearTimeout(t);
    }
    prevAllIn.current = allIn;
  }, [allIn]);

  return (
    <div
      className={`flex flex-col gap-2 p-3 transition-all duration-300 ${
        flashing ? "all-in-flash rounded" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="section-label">{label ?? "Votes in"}</span>
        <span
          className={`font-display text-sm tabular-nums transition-colors duration-300 ${
            allIn ? "text-green-400" : "text-paper"
          }`}
          style={allIn ? { textShadow: "0 0 8px rgba(34,197,94,0.5)" } : undefined}
        >
          {voted}/{total}
        </span>
      </div>
      <div className="stat-bar-track h-2">
        <div
          className={`h-full transition-all duration-300 ${
            allIn ? "bg-green-500" : "bg-accent"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {allIn && (
        <p className="text-xs text-green-400 font-display uppercase tracking-widest text-center">
          All votes in
        </p>
      )}
    </div>
  );
}
