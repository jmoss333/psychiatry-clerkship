import { assertWorkspaceIntegrity } from "./integrity";
import type { WorkspaceState } from "./model";
import { WorkspaceStateSchema } from "./schemas";

export const WORKSPACE_KEY = "cw_reason_workbench_v1";

export type LoadWorkspaceResult =
  | { status: "missing" }
  | { status: "loaded"; workspace: WorkspaceState }
  | { status: "unavailable"; message: string }
  | { status: "invalid"; message: string };

function readableErrorMessage(error: unknown, fallback: string): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return fallback;
}

export function loadWorkspace(storage: Storage): LoadWorkspaceResult {
  let raw: string | null;
  try {
    raw = storage.getItem(WORKSPACE_KEY);
  } catch (error) {
    return {
      status: "unavailable",
      message: readableErrorMessage(error, "Local storage is unavailable"),
    };
  }
  if (raw === null) return { status: "missing" };
  try {
    return {
      status: "loaded",
      workspace: assertWorkspaceIntegrity(
        WorkspaceStateSchema.parse(JSON.parse(raw)),
      ),
    };
  } catch (error) {
    return {
      status: "invalid",
      message: readableErrorMessage(error, "Stored workspace is invalid"),
    };
  }
}

export function saveWorkspace(
  storage: Storage,
  workspace: WorkspaceState,
): void {
  storage.setItem(
    WORKSPACE_KEY,
    JSON.stringify(assertWorkspaceIntegrity(workspace)),
  );
}

export function resetStoredWorkspace(storage: Storage): void {
  storage.removeItem(WORKSPACE_KEY);
}
