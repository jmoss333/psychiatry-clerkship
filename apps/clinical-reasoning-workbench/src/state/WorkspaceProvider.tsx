import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type { Dispatch, PropsWithChildren } from "react";
import {
  createSeedWorkspace,
  loadRuntimeContent,
  type RuntimeContent,
} from "../content/loadContent";
import {
  assertWorkspaceContentReferences,
  assertWorkspaceIntegrity,
} from "../domain/integrity";
import type { WorkspaceAction, WorkspaceState } from "../domain/model";
import {
  loadWorkspace,
  resetStoredWorkspace,
  saveWorkspace,
} from "../domain/persistence";
import { parsePreviewQuery } from "../domain/query";
import type { PreviewSelection } from "../domain/query";
import { workspaceReducer } from "../domain/reducer";
import { WorkspaceStateSchema } from "../domain/schemas";
import { WorkspaceContext } from "./useWorkspace";

const READ_UNAVAILABLE_MESSAGE =
  "Local storage is unavailable; work will be lost on reload.";
const WRITE_UNAVAILABLE_MESSAGE =
  "Local saving is unavailable; work will be lost on reload.";
const RESET_FAILURE_MESSAGE = "The fictional workspace could not be reset.";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export type WorkspaceContextValue = {
  workspace: WorkspaceState;
  content: RuntimeContent;
  dispatch: Dispatch<WorkspaceAction>;
  selectedFactIds: string[];
  selectFacts: (factIds: string[]) => void;
  evidencePanelOpen: boolean;
  evidenceFocusRequest: { factId: string; requestId: number } | null;
  openEvidencePanel: () => void;
  closeEvidencePanel: () => void;
  revealFact: (factId: string) => void;
  saveStatus: SaveStatus;
  loadError: string | null;
  persistenceError: string | null;
  resetInvalidWorkspace: () => void;
};

export type WorkspaceProviderProps = PropsWithChildren<{
  initialWorkspace?: WorkspaceState;
  storage?: Storage;
  previewSelection?: PreviewSelection;
  content?: RuntimeContent;
}>;

type ResolvedStorage = {
  storage: Storage;
  accessUnavailable: boolean;
};

type InitialProviderState = {
  workspace: WorkspaceState;
  loadError: string | null;
  persistenceError: string | null;
  saveStatus: SaveStatus;
  readUnavailable: boolean;
};

let bundledRuntimeContent: RuntimeContent | undefined;

function getBundledRuntimeContent(): RuntimeContent {
  bundledRuntimeContent ??= loadRuntimeContent();
  return bundledRuntimeContent;
}

function makeUnavailableStorage(cause: unknown): Storage {
  const error =
    cause instanceof Error ? cause : new Error("Local storage is unavailable");
  const fail = (): never => {
    throw error;
  };
  return {
    get length() {
      return fail();
    },
    clear: fail,
    getItem: fail,
    key: fail,
    removeItem: fail,
    setItem: fail,
  };
}

function resolveStorage(provided: Storage | undefined): ResolvedStorage {
  if (provided) return { storage: provided, accessUnavailable: false };
  try {
    return { storage: window.localStorage, accessUnavailable: false };
  } catch (error) {
    return {
      storage: makeUnavailableStorage(error),
      accessUnavailable: true,
    };
  }
}

function validateWorkspace(
  workspace: WorkspaceState,
  content: RuntimeContent,
): WorkspaceState {
  return assertWorkspaceContentReferences(
    assertWorkspaceIntegrity(
      WorkspaceStateSchema.parse(structuredClone(workspace)),
    ),
    content,
  );
}

function applyLevelOverride(
  workspace: WorkspaceState,
  selection: PreviewSelection,
  content: RuntimeContent,
): WorkspaceState {
  const validated = validateWorkspace(workspace, content);
  if (!selection.levelOverride) return validated;
  return assertWorkspaceContentReferences(
    assertWorkspaceIntegrity({
      ...validated,
      learnerLevel: selection.levelOverride,
    }),
    content,
  );
}

function readableErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Stored workspace is invalid";
}

function initializeProvider(
  initialWorkspace: WorkspaceState | undefined,
  resolvedStorage: ResolvedStorage,
  selection: PreviewSelection,
  content: RuntimeContent,
): InitialProviderState {
  const freshWorkspace = () =>
    createSeedWorkspace(
      content.caseDefinition,
      selection.levelOverride ?? "ms3",
    );

  if (initialWorkspace) {
    return {
      workspace: applyLevelOverride(initialWorkspace, selection, content),
      loadError: null,
      persistenceError: resolvedStorage.accessUnavailable
        ? READ_UNAVAILABLE_MESSAGE
        : null,
      saveStatus: resolvedStorage.accessUnavailable ? "error" : "idle",
      readUnavailable: resolvedStorage.accessUnavailable,
    };
  }

  if (resolvedStorage.accessUnavailable) {
    return {
      workspace: freshWorkspace(),
      loadError: null,
      persistenceError: READ_UNAVAILABLE_MESSAGE,
      saveStatus: "error",
      readUnavailable: true,
    };
  }

  const loaded = loadWorkspace(resolvedStorage.storage);
  if (loaded.status === "loaded") {
    try {
      return {
        workspace: applyLevelOverride(loaded.workspace, selection, content),
        loadError: null,
        persistenceError: null,
        saveStatus: "idle",
        readUnavailable: false,
      };
    } catch (error) {
      return {
        workspace: freshWorkspace(),
        loadError: readableErrorMessage(error),
        persistenceError: null,
        saveStatus: "idle",
        readUnavailable: false,
      };
    }
  }

  if (loaded.status === "unavailable") {
    return {
      workspace: freshWorkspace(),
      loadError: null,
      persistenceError: READ_UNAVAILABLE_MESSAGE,
      saveStatus: "error",
      readUnavailable: true,
    };
  }

  if (loaded.status === "invalid") {
    return {
      workspace: freshWorkspace(),
      loadError: loaded.message,
      persistenceError: null,
      saveStatus: "idle",
      readUnavailable: false,
    };
  }

  return {
    workspace: freshWorkspace(),
    loadError: null,
    persistenceError: null,
    saveStatus: "idle",
    readUnavailable: false,
  };
}

export function WorkspaceProvider({
  children,
  initialWorkspace,
  storage,
  previewSelection,
  content: contentFixture,
}: WorkspaceProviderProps) {
  const [configuration] = useState(() => {
    const content = contentFixture ?? getBundledRuntimeContent();
    const selection =
      previewSelection ?? parsePreviewQuery(window.location.search);
    const resolvedStorage = resolveStorage(storage);
    return {
      content,
      selection,
      resolvedStorage,
      initial: initializeProvider(
        initialWorkspace,
        resolvedStorage,
        selection,
        content,
      ),
    };
  });
  const { content, initial, resolvedStorage, selection } = configuration;

  const [workspace, reducerDispatch] = useReducer(
    workspaceReducer,
    initial.workspace,
  );
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(initial.saveStatus);
  const [loadError, setLoadError] = useState<string | null>(initial.loadError);
  const [persistenceError, setPersistenceError] = useState<string | null>(
    initial.persistenceError,
  );
  const [selectedFactIds, setSelectedFactIds] = useState<string[]>([]);
  const [evidencePanelOpen, setEvidencePanelOpen] = useState(false);
  const [evidenceFocusRequest, setEvidenceFocusRequest] = useState<{
    factId: string;
    requestId: number;
  } | null>(null);
  const saveRequested = useRef(false);
  const readUnavailable = useRef(initial.readUnavailable);

  const dispatch = useCallback<Dispatch<WorkspaceAction>>(
    (action) => {
      if (loadError === null) {
        saveRequested.current = true;
        setSaveStatus("saving");
      }
      reducerDispatch(action);
    },
    [loadError],
  );

  useEffect(() => {
    if (!saveRequested.current) return;
    saveRequested.current = false;
    const snapshot = structuredClone(workspace);
    const timer = window.setTimeout(() => {
      try {
        saveWorkspace(
          resolvedStorage.storage,
          assertWorkspaceContentReferences(snapshot, content),
        );
        if (readUnavailable.current) {
          setSaveStatus("error");
          setPersistenceError(READ_UNAVAILABLE_MESSAGE);
        } else {
          setSaveStatus("saved");
          setPersistenceError(null);
        }
      } catch {
        setSaveStatus("error");
        setPersistenceError(
          readUnavailable.current
            ? READ_UNAVAILABLE_MESSAGE
            : WRITE_UNAVAILABLE_MESSAGE,
        );
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [content, resolvedStorage.storage, workspace]);

  const factIds = useMemo(
    () => new Set(workspace.facts.map((fact) => fact.id)),
    [workspace.facts],
  );

  const selectFacts = useCallback(
    (requestedIds: string[]) => {
      const seen = new Set<string>();
      const selected = requestedIds.filter((id) => {
        if (!factIds.has(id) || seen.has(id)) return false;
        seen.add(id);
        return true;
      });
      setSelectedFactIds(selected);
    },
    [factIds],
  );

  const openEvidencePanel = useCallback(() => {
    setEvidencePanelOpen(true);
  }, []);

  const closeEvidencePanel = useCallback(() => {
    setEvidencePanelOpen(false);
  }, []);

  const revealFact = useCallback(
    (factId: string) => {
      if (!factIds.has(factId)) throw new Error(`Unknown fact ${factId}`);
      setSelectedFactIds([factId]);
      setEvidencePanelOpen(true);
      setEvidenceFocusRequest((current) => ({
        factId,
        requestId: (current?.requestId ?? 0) + 1,
      }));
    },
    [factIds],
  );

  const resetInvalidWorkspace = useCallback(() => {
    if (loadError === null) return;
    try {
      resetStoredWorkspace(resolvedStorage.storage);
    } catch {
      setSaveStatus("error");
      setPersistenceError(RESET_FAILURE_MESSAGE);
      return;
    }

    saveRequested.current = false;
    reducerDispatch({
      type: "resetWorkspace",
      workspace: createSeedWorkspace(
        content.caseDefinition,
        selection.levelOverride ?? "ms3",
      ),
    });
    setLoadError(null);
    setPersistenceError(null);
    setSaveStatus("idle");
    setSelectedFactIds([]);
    setEvidencePanelOpen(false);
    setEvidenceFocusRequest(null);
  }, [content.caseDefinition, loadError, resolvedStorage.storage, selection]);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      workspace,
      content,
      dispatch,
      selectedFactIds,
      selectFacts,
      evidencePanelOpen,
      evidenceFocusRequest,
      openEvidencePanel,
      closeEvidencePanel,
      revealFact,
      saveStatus,
      loadError,
      persistenceError,
      resetInvalidWorkspace,
    }),
    [
      workspace,
      content,
      dispatch,
      selectedFactIds,
      selectFacts,
      evidencePanelOpen,
      evidenceFocusRequest,
      openEvidencePanel,
      closeEvidencePanel,
      revealFact,
      saveStatus,
      loadError,
      persistenceError,
      resetInvalidWorkspace,
    ],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}
