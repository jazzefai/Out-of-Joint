"use client";

interface StatBarProps {
  label: string;
  value: number;
  max?: number;
  color: string; // tailwind color class like 'bg-stat-e'
  borderColor: string;
  textColor: string;
}

export function StatBar({
  label,
  value,
  max = 10,
  color,
  borderColor,
  textColor,
}: StatBarProps) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const isLow = value <= 2;
  const isDead = value <= 0;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className={`text-xs font-display uppercase tracking-widest ${textColor}`}>
          {label}
        </span>
        <span
          className={`font-display text-sm font-mono-feature ${
            isDead ? "text-red-500" : isLow ? "text-orange-400" : textColor
          }`}
        >
          {value}
        </span>
      </div>
      <div className="stat-bar-track">
        <div
          className={`h-full transition-all duration-700 ease-out ${isDead ? "bg-red-500" : isLow ? "bg-orange-400" : color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

interface CityStatsCardProps {
  economy: number;
  cohesion: number;
  autonomy: number;
  teamName?: string;
  compact?: boolean;
}

export function CityStatsCard({
  economy,
  cohesion,
  autonomy,
  teamName,
  compact = false,
}: CityStatsCardProps) {
  const collapsed = economy <= 0 || cohesion <= 0 || autonomy <= 0;

  return (
    <div
      className={`card-dark ${collapsed ? "border-red-500/50" : ""} ${
        compact ? "p-3" : "p-4"
      }`}
    >
      {teamName && (
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-display text-paper truncate">{teamName}</span>
          {collapsed && (
            <span className="text-xs font-display uppercase text-red-500 tracking-wider">
              Collapsed
            </span>
          )}
        </div>
      )}
      <div className={`flex flex-col gap-${compact ? "2" : "3"}`}>
        <StatBar
          label="E"
          value={economy}
          color="bg-stat-e"
          borderColor="border-stat-e"
          textColor="text-stat-e"
        />
        <StatBar
          label="C"
          value={cohesion}
          color="bg-stat-c"
          borderColor="border-stat-c"
          textColor="text-stat-c"
        />
        <StatBar
          label="A"
          value={autonomy}
          color="bg-stat-a"
          borderColor="border-stat-a"
          textColor="text-stat-a"
        />
      </div>
    </div>
  );
}
