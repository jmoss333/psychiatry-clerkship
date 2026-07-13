import type { FactReliability } from "../../domain/model";

const RELIABILITY_LABELS: Record<FactReliability, string> = {
  high: "High",
  moderate: "Moderate",
  low: "Low",
  unknown: "Unknown",
};

type SourceReliabilityProps = {
  reliability: FactReliability;
};

export function SourceReliability({ reliability }: SourceReliabilityProps) {
  const label = RELIABILITY_LABELS[reliability];
  return (
    <span
      className={`source-reliability source-reliability--${reliability}`}
      aria-label={`Reliability: ${label}`}
    >
      {label}
    </span>
  );
}
