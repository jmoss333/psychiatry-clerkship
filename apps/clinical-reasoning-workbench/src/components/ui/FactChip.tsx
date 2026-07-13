import { useWorkspace } from "../../state/useWorkspace";

type FactChipProps = {
  factId: string;
  className?: string;
};

export function FactChip({ factId, className = "" }: FactChipProps) {
  const { revealFact, selectedFactIds } = useWorkspace();
  const isSelected = selectedFactIds.includes(factId);

  return (
    <button
      type="button"
      className={`fact-chip ${isSelected ? "is-selected" : ""} ${className}`.trim()}
      aria-pressed={isSelected}
      onClick={() => revealFact(factId)}
    >
      {factId}
    </button>
  );
}
