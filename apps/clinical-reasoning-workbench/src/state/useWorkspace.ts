import { createContext, useContext } from "react";
import type { WorkspaceContextValue } from "./WorkspaceProvider";

export const WorkspaceContext = createContext<
  WorkspaceContextValue | undefined
>(undefined);

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used inside WorkspaceProvider");
  }
  return context;
}
