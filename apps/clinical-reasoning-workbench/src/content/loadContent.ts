import { assertWorkspaceIntegrity } from "../domain/integrity";
import type {
  CaseDefinition,
  LearnerLevel,
  WorkspaceState,
} from "../domain/model";

export function createSeedWorkspace(
  caseDefinition: CaseDefinition,
  level: LearnerLevel,
): WorkspaceState {
  const content = structuredClone({
    facts: caseDefinition.facts,
    timelineItems: caseDefinition.timelineItems,
    hypotheses: caseDefinition.hypotheses,
  });
  const workspace: WorkspaceState = {
    schemaVersion: 1,
    caseId: caseDefinition.id,
    caseVersion: caseDefinition.version,
    learnerLevel: level,
    facts: content.facts,
    timelineItems: content.timelineItems,
    temporalRelations: [],
    mseTranslations: [],
    hypotheses: content.hypotheses,
    summary: [],
    syntheticDataAcknowledged: false,
    updatedAt: new Date().toISOString(),
  };

  return assertWorkspaceIntegrity(workspace);
}
