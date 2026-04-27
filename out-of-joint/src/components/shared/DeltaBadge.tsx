import type { StatDelta } from "@/types";

interface DeltaBadgeProps {
  delta: StatDelta;
  label?: string;
}

function DeltaChip({ value, stat }: { value: number; stat: string }) {
  if (value === 0) return null;
  const positive = value > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 font-display text-xs px-2 py-0.5 border ${
        positive
          ? "border-green-500/40 text-green-400"
          : "border-red-500/40 text-red-400"
      }`}
    >
      <span className="opacity-60">{stat}</span>
      <span>{positive ? "+" : ""}{value}</span>
    </span>
  );
}

export function DeltaBadge({ delta, label }: DeltaBadgeProps) {
  const isEmpty =
    delta.economy === 0 && delta.cohesion === 0 && delta.autonomy === 0;

  return (
    <div className="flex flex-col gap-1.5">
      {label && <span className="section-label">{label}</span>}
      <div className="flex flex-wrap gap-1.5">
        {isEmpty ? (
          <span className="text-xs text-muted font-display">No change</span>
        ) : (
          <>
            <DeltaChip value={delta.economy} stat="E" />
            <DeltaChip value={delta.cohesion} stat="C" />
            <DeltaChip value={delta.autonomy} stat="A" />
          </>
        )}
      </div>
    </div>
  );
}
