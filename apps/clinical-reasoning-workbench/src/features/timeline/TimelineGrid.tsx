import type { CaseFact, TimelineItem } from "../../domain/model";
import { VISIBLE_TIME_COLUMNS } from "../../domain/factEditing";
import { useWorkspace } from "../../state/useWorkspace";
import { Button } from "../../components/ui/Button";
import { FactChip } from "../../components/ui/FactChip";
import { TIMELINE_LANES } from "./timelineModel";

type TimelineGridProps = {
  onEditItem: (itemId: string, trigger: HTMLButtonElement) => void;
};

function linkedFacts(item: TimelineItem, factsById: Map<string, CaseFact>) {
  return item.factIds.flatMap((factId) => {
    const fact = factsById.get(factId);
    return fact ? [fact] : [];
  });
}

function displaySemantics(item: TimelineItem, facts: CaseFact[]) {
  const values: Array<{ className: string; label: string }> = [];
  if (item.end) {
    values.push({ className: "ongoing", label: "Ongoing — solid line" });
  } else {
    values.push({ className: "point", label: "Point event — filled dot" });
  }
  if (facts.some((fact) => fact.certainty !== "confirmed")) {
    values.push({
      className: "uncertain",
      label: "Probable or uncertain — dotted line",
    });
  }
  if (item.approximate) {
    values.push({
      className: "approximate",
      label: "Approximate — outlined dot",
    });
  }
  return values;
}

function TimelineMark({
  item,
  factsById,
  onEditItem,
  selected,
}: {
  item: TimelineItem;
  factsById: Map<string, CaseFact>;
  onEditItem: TimelineGridProps["onEditItem"];
  selected: boolean;
}) {
  const facts = linkedFacts(item, factsById);
  const semantics = displaySemantics(item, facts);
  const factLabel = item.factIds.join(", ");
  const timeLabel = item.end
    ? `${item.start ?? "Start not specified"} to ${item.end}`
    : (item.start ?? "Time not specified");

  return (
    <article
      className={`timeline-mark ${semantics
        .map((value) => `timeline-mark--${value.className}`)
        .join(" ")} ${selected ? "is-evidence-selected" : ""}`.trim()}
      aria-label={`${semantics.map((value) => value.label).join("; ")}: ${item.label}; ${factLabel}`}
      data-display-semantics={semantics
        .map((value) => value.className)
        .join(" ")}
      data-timeline-item-id={item.id}
      {...(item.episodeId ? { "data-episode-id": item.episodeId } : {})}
    >
      <span className="timeline-mark__cues" aria-hidden="true">
        {semantics.map((value) => (
          <span
            key={value.className}
            className={`timeline-mark__cue timeline-mark__cue--${value.className}`}
          />
        ))}
      </span>
      <p className="timeline-mark__label">{item.label}</p>
      <p className="timeline-mark__time">{timeLabel}</p>
      {item.episodeId ? (
        <p className="timeline-mark__episode">Episode: {item.episodeId}</p>
      ) : null}
      <div className="timeline-mark__facts">
        {item.factIds.map((factId) => (
          <FactChip key={factId} factId={factId} />
        ))}
      </div>
      <Button
        variant="ghost"
        className="timeline-mark__edit"
        aria-label={`Edit ${factLabel} timeline event`}
        onClick={(event) => onEditItem(item.id, event.currentTarget)}
      >
        Edit event
      </Button>
    </article>
  );
}

export function TimelineGrid({ onEditItem }: TimelineGridProps) {
  const { selectedFactIds, workspace } = useWorkspace();
  const factsById = new Map(workspace.facts.map((fact) => [fact.id, fact]));

  return (
    <div
      className="timeline-grid-scroll"
      role="region"
      aria-label="Psychiatric timeline grid"
      tabIndex={0}
    >
      <table className="timeline-grid" aria-label="Psychiatric timeline">
        <thead>
          <tr>
            <th
              className="timeline-grid__lane timeline-grid__corner"
              scope="col"
            >
              Timeline lane
            </th>
            {VISIBLE_TIME_COLUMNS.map((column) => (
              <th key={column.value} scope="col">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {TIMELINE_LANES.map((lane) => {
            const laneItems = workspace.timelineItems.filter(
              (item) => item.lane === lane.value,
            );
            return (
              <tr key={lane.value}>
                <th className="timeline-grid__lane" scope="row">
                  {lane.label}
                </th>
                {VISIBLE_TIME_COLUMNS.map((column) => {
                  const items = laneItems.filter(
                    (item) => item.sortOrder === column.value,
                  );
                  const selected = items.some((item) =>
                    item.factIds.some((factId) =>
                      selectedFactIds.includes(factId),
                    ),
                  );
                  return (
                    <td
                      key={column.value}
                      className={selected ? "is-evidence-selected" : undefined}
                    >
                      <div className="timeline-grid__events">
                        {items.map((item) => (
                          <TimelineMark
                            key={item.id}
                            item={item}
                            factsById={factsById}
                            selected={item.factIds.some((factId) =>
                              selectedFactIds.includes(factId),
                            )}
                            onEditItem={onEditItem}
                          />
                        ))}
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
