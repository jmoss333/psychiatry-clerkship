import { FactChip } from "./FactChip";

type LinkedTextProps = {
  text: string;
  factIds: string[];
  className?: string;
};

export function LinkedText({ text, factIds, className = "" }: LinkedTextProps) {
  return (
    <span className={`linked-text ${className}`.trim()}>
      <span>{text}</span>
      {factIds.map((factId, index) => (
        <FactChip key={`${factId}-${index}`} factId={factId} />
      ))}
    </span>
  );
}
