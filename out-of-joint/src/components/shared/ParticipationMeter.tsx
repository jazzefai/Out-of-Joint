"use client";

interface ParticipationMeterProps {
  voted: number;
  total: number;
  label?: string;
}

export function ParticipationMeter({
  voted,
  total,
  label,
}: ParticipationMeterProps) {
  const pct = total > 0 ? (voted / total) * 100 : 0;
  const allIn = voted >= total && total > 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="section-label">{label ?? "Votes in"}</span>
        <span
          className={`font-display text-sm ${
            allIn ? "text-green-400" : "text-paper"
          }`}
        >
          {voted}/{total}
        </span>
      </div>
      <div className="stat-bar-track h-3">
        <div
          className={`h-full transition-all duration-300 ${
            allIn ? "bg-green-500" : "bg-accent"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {allIn && (
        <p className="text-xs text-green-400 font-display uppercase tracking-wider text-center animate-pulse">
          All votes in!
        </p>
      )}
    </div>
  );
}
