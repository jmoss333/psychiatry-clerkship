import rawCase from "../content/cases/first-episode.json";
import { createSeedWorkspace } from "../content/loadContent";
import type { WorkspaceState } from "../domain/model";
import { parseCaseDefinition } from "../domain/schemas";

export function makeWorkspace(
  level: "ms3" | "resident" = "ms3",
): WorkspaceState {
  return createSeedWorkspace(parseCaseDefinition(rawCase), level);
}
