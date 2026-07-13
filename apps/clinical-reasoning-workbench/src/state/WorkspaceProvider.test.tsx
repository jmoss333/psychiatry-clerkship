import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, expect, test, vi } from "vitest";
import type { WorkspaceState } from "../domain/model";
import { WORKSPACE_KEY } from "../domain/persistence";
import type { PreviewSelection } from "../domain/query";
import {
  makeMemoryStorage,
  makeThrowingStorage,
  makeWorkspace,
} from "../test/fixtures";
import { renderApp } from "../test/renderApp";
import { WorkspaceProvider } from "./WorkspaceProvider";
import { useWorkspace } from "./useWorkspace";

const NO_LEVEL: PreviewSelection = { caseId: "first_episode_001" };

function ProviderProbe() {
  const {
    workspace,
    dispatch,
    saveStatus,
    loadError,
    persistenceError,
    selectedFactIds,
    selectFacts,
    evidencePanelOpen,
    evidenceFocusRequest,
    openEvidencePanel,
    closeEvidencePanel,
    revealFact,
    resetInvalidWorkspace,
  } = useWorkspace();
  return (
    <>
      <output aria-label="Learner level">{workspace.learnerLevel}</output>
      <output aria-label="Acknowledged">
        {String(workspace.syntheticDataAcknowledged)}
      </output>
      <output aria-label="First fact">{workspace.facts[0]?.text}</output>
      <output aria-label="Save status">{saveStatus}</output>
      <output aria-label="Selected facts">{selectedFactIds.join(",")}</output>
      <output aria-label="Evidence panel open">
        {String(evidencePanelOpen)}
      </output>
      <output aria-label="Evidence focus request">
        {evidenceFocusRequest
          ? `${evidenceFocusRequest.factId}:${evidenceFocusRequest.requestId}`
          : "none"}
      </output>
      {loadError ? <output aria-label="Load error">{loadError}</output> : null}
      {persistenceError ? <div role="alert">{persistenceError}</div> : null}
      <button
        type="button"
        onClick={() => dispatch({ type: "setLearnerLevel", level: "resident" })}
      >
        Set resident
      </button>
      <button
        type="button"
        onClick={() => dispatch({ type: "setLearnerLevel", level: "ms3" })}
      >
        Set MS3
      </button>
      <button
        type="button"
        onClick={() => dispatch({ type: "acknowledgeSyntheticData" })}
      >
        Acknowledge
      </button>
      <button
        type="button"
        onClick={() => selectFacts(["F02", "F02", "unknown", "F01"])}
      >
        Select facts
      </button>
      <button type="button" onClick={() => revealFact("F01")}>
        Reveal F01
      </button>
      <button type="button" onClick={openEvidencePanel}>
        Open evidence
      </button>
      <button type="button" onClick={closeEvidencePanel}>
        Close evidence
      </button>
      <button type="button" onClick={resetInvalidWorkspace}>
        Reset invalid workspace
      </button>
    </>
  );
}

function makeTrackingStorage(seed: Record<string, string> = {}) {
  const memory = makeMemoryStorage(seed);
  const reads: string[] = [];
  const writes: Array<{ key: string; value: string }> = [];
  const removals: string[] = [];
  const storage: Storage = {
    get length() {
      return memory.length;
    },
    clear: () => memory.clear(),
    getItem: (key) => {
      reads.push(key);
      return memory.getItem(key);
    },
    key: (index) => memory.key(index),
    removeItem: (key) => {
      removals.push(key);
      memory.removeItem(key);
    },
    setItem: (key, value) => {
      writes.push({ key, value });
      memory.setItem(key, value);
    },
  };
  return { storage, reads, writes, removals };
}

afterEach(() => {
  vi.useRealTimers();
  window.history.replaceState({}, "", "/");
});

test("initialWorkspace takes precedence over storage and is not mutated by a level override", () => {
  const fixture = makeWorkspace("resident");
  fixture.syntheticDataAcknowledged = true;
  const before = structuredClone(fixture);

  renderApp(<ProviderProbe />, {
    workspace: fixture,
    storage: makeThrowingStorage({
      get: new DOMException("Storage should not be read", "SecurityError"),
    }),
    previewSelection: {
      caseId: "first_episode_001",
      levelOverride: "ms3",
    },
  });

  expect(screen.getByLabelText("Learner level")).toHaveTextContent("ms3");
  expect(screen.getByLabelText("Acknowledged")).toHaveTextContent("true");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(fixture).toEqual(before);
});

test("validates an initial workspace before exposing it", () => {
  const invalid = {
    ...makeWorkspace(),
    schemaVersion: 99,
  } as unknown as WorkspaceState;
  const consoleError = vi
    .spyOn(console, "error")
    .mockImplementation(() => undefined);
  try {
    expect(() =>
      renderApp(<ProviderProbe />, {
        workspace: invalid,
        storage: makeMemoryStorage(),
        previewSelection: NO_LEVEL,
      }),
    ).toThrow();
  } finally {
    consoleError.mockRestore();
  }
});

test("loads a valid stored workspace once and does not autosave hydration", () => {
  const stored = makeWorkspace("resident");
  stored.syntheticDataAcknowledged = true;
  const { storage, reads, writes } = makeTrackingStorage({
    [WORKSPACE_KEY]: JSON.stringify(stored),
  });

  renderApp(<ProviderProbe />, { storage, previewSelection: NO_LEVEL });

  expect(screen.getByLabelText("Learner level")).toHaveTextContent("resident");
  expect(screen.getByLabelText("Acknowledged")).toHaveTextContent("true");
  expect(reads).toEqual([WORKSPACE_KEY]);
  expect(writes).toEqual([]);

  fireEvent.click(screen.getByRole("button", { name: "Select facts" }));
  expect(reads).toEqual([WORKSPACE_KEY]);
  expect(writes).toEqual([]);
});

test("a valid explicit level override preserves the rest of loaded work", () => {
  const stored = makeWorkspace("ms3");
  stored.syntheticDataAcknowledged = true;
  stored.facts[0]!.text = "Preserved learner fact edit";
  const storage = makeMemoryStorage({
    [WORKSPACE_KEY]: JSON.stringify(stored),
  });

  renderApp(<ProviderProbe />, {
    storage,
    previewSelection: {
      caseId: "first_episode_001",
      levelOverride: "resident",
    },
  });

  expect(screen.getByLabelText("Learner level")).toHaveTextContent("resident");
  expect(screen.getByLabelText("Acknowledged")).toHaveTextContent("true");
  expect(screen.getByLabelText("First fact")).toHaveTextContent(
    "Preserved learner fact edit",
  );
});

test.each([
  ["?case=first_episode_001", "resident"],
  ["?level=resident", "resident"],
  ["?level=ms3", "ms3"],
  ["?level=attending", "ms3"],
] as const)(
  "URL selection %s resolves the loaded level to %s",
  (search, expectedLevel) => {
    window.history.replaceState({}, "", `/${search}`);
    const stored = makeWorkspace("resident");
    renderApp(<ProviderProbe />, {
      storage: makeMemoryStorage({
        [WORKSPACE_KEY]: JSON.stringify(stored),
      }),
    });
    expect(screen.getByLabelText("Learner level")).toHaveTextContent(
      expectedLevel,
    );
  },
);

test("missing storage seeds MS3 without writing during mount", () => {
  const { storage, writes } = makeTrackingStorage();
  renderApp(<ProviderProbe />, { storage, previewSelection: NO_LEVEL });
  expect(screen.getByLabelText("Learner level")).toHaveTextContent("ms3");
  expect(screen.getByLabelText("Save status")).toHaveTextContent("idle");
  expect(storage.getItem(WORKSPACE_KEY)).toBeNull();
  expect(writes).toEqual([]);
});

test("resolved URL selection is stable across provider rerenders", () => {
  window.history.replaceState({}, "", "/?level=resident");
  renderApp(<ProviderProbe />, { storage: makeMemoryStorage() });
  expect(screen.getByLabelText("Learner level")).toHaveTextContent("resident");

  window.history.replaceState({}, "", "/?level=ms3");
  fireEvent.click(screen.getByRole("button", { name: "Select facts" }));
  expect(screen.getByLabelText("Learner level")).toHaveTextContent("resident");
});

test("readable invalid storage is retained and cannot be overwritten by dispatch", () => {
  vi.useFakeTimers();
  const raw = '{"schemaVersion":99}';
  const storage = makeMemoryStorage({ [WORKSPACE_KEY]: raw });
  renderApp(<ProviderProbe />, { storage, previewSelection: NO_LEVEL });

  expect(screen.getByLabelText("Load error")).not.toHaveTextContent("");
  fireEvent.click(screen.getByRole("button", { name: "Acknowledge" }));
  act(() => vi.runAllTimers());
  expect(storage.getItem(WORKSPACE_KEY)).toBe(raw);
});

test("explicit successful reset removes invalid storage and installs a fresh seed", () => {
  const raw = '{"schemaVersion":99}';
  const storage = makeMemoryStorage({ [WORKSPACE_KEY]: raw });
  renderApp(<ProviderProbe />, { storage, previewSelection: NO_LEVEL });

  fireEvent.click(
    screen.getByRole("button", { name: "Reset invalid workspace" }),
  );

  expect(storage.getItem(WORKSPACE_KEY)).toBeNull();
  expect(screen.queryByLabelText("Load error")).not.toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Learner level")).toHaveTextContent("ms3");
  expect(screen.getByLabelText("Save status")).toHaveTextContent("idle");
});

test("reset removal failure retains raw storage and the load error", () => {
  const raw = '{"schemaVersion":99}';
  const storage = makeThrowingStorage({
    remove: new Error("Removal blocked"),
  });
  storage.setItem(WORKSPACE_KEY, raw);
  renderApp(<ProviderProbe />, { storage, previewSelection: NO_LEVEL });
  const initialLoadError = screen.getByLabelText("Load error").textContent;

  fireEvent.click(
    screen.getByRole("button", { name: "Reset invalid workspace" }),
  );

  expect(storage.getItem(WORKSPACE_KEY)).toBe(raw);
  expect(screen.getByLabelText("Load error").textContent).toBe(
    initialLoadError,
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    "The fictional workspace could not be reset.",
  );
});

test.each([
  ["case ID", { caseId: "another_case" }],
  ["case version", { caseVersion: 99 }],
] as const)(
  "treats a persisted %s mismatch as invalid recovery",
  (_label, patch) => {
    const stored = Object.assign(makeWorkspace("resident"), patch);
    const raw = JSON.stringify(stored);
    const storage = makeMemoryStorage({ [WORKSPACE_KEY]: raw });
    renderApp(<ProviderProbe />, { storage, previewSelection: NO_LEVEL });

    expect(screen.getByLabelText("Load error")).toHaveTextContent(/@/);
    expect(storage.getItem(WORKSPACE_KEY)).toBe(raw);
    expect(screen.getByLabelText("Learner level")).toHaveTextContent("ms3");
  },
);

test("storage read unavailability keeps a usable in-memory workspace", () => {
  const storage = makeThrowingStorage({
    get: new DOMException("Blocked", "SecurityError"),
  });
  renderApp(<ProviderProbe />, { storage, previewSelection: NO_LEVEL });

  expect(screen.getByLabelText("Learner level")).toHaveTextContent("ms3");
  expect(screen.queryByLabelText("Load error")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Save status")).toHaveTextContent("error");
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Local storage is unavailable; work will be lost on reload.",
  );
});

test("a read-unavailable warning remains even if a later setItem succeeds", () => {
  vi.useFakeTimers();
  const storage = makeThrowingStorage({
    get: new DOMException("Blocked", "SecurityError"),
  });
  renderApp(<ProviderProbe />, { storage, previewSelection: NO_LEVEL });

  fireEvent.click(screen.getByRole("button", { name: "Set resident" }));
  act(() => vi.runAllTimers());

  expect(screen.getByLabelText("Learner level")).toHaveTextContent("resident");
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Local storage is unavailable; work will be lost on reload.",
  );
});

test("failure while accessing window.localStorage is recovered in memory", () => {
  const descriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
  if (!descriptor) throw new Error("Expected a localStorage descriptor");
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    get() {
      throw new DOMException("Getter blocked", "SecurityError");
    },
  });
  try {
    render(
      <WorkspaceProvider previewSelection={NO_LEVEL}>
        <ProviderProbe />
      </WorkspaceProvider>,
    );
    expect(screen.getByLabelText("Learner level")).toHaveTextContent("ms3");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Local storage is unavailable; work will be lost on reload.",
    );
  } finally {
    Object.defineProperty(window, "localStorage", descriptor);
  }
});

test("keeps in-memory work and reports a storage write failure", () => {
  vi.useFakeTimers();
  renderApp(<ProviderProbe />, {
    storage: makeThrowingStorage({ set: new Error("Quota exceeded") }),
    previewSelection: NO_LEVEL,
  });

  fireEvent.click(screen.getByRole("button", { name: "Set resident" }));
  expect(screen.getByLabelText("Learner level")).toHaveTextContent("resident");
  expect(screen.getByLabelText("Save status")).toHaveTextContent("saving");

  act(() => vi.runAllTimers());
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Local saving is unavailable; work will be lost on reload.",
  );
  expect(screen.getByLabelText("Save status")).toHaveTextContent("error");
});

test("renders saving before saved across a macrotask boundary", () => {
  vi.useFakeTimers();
  renderApp(<ProviderProbe />, {
    storage: makeMemoryStorage(),
    previewSelection: NO_LEVEL,
  });

  fireEvent.click(screen.getByRole("button", { name: "Set resident" }));
  expect(screen.getByLabelText("Save status")).toHaveTextContent("saving");

  act(() => vi.runOnlyPendingTimers());
  expect(screen.getByLabelText("Save status")).toHaveTextContent("saved");
});

test("a newer reducer commit cancels the older save and writes its latest snapshot", () => {
  vi.useFakeTimers();
  const { storage, writes } = makeTrackingStorage();
  renderApp(<ProviderProbe />, { storage, previewSelection: NO_LEVEL });

  fireEvent.click(screen.getByRole("button", { name: "Set resident" }));
  fireEvent.click(screen.getByRole("button", { name: "Set MS3" }));
  expect(screen.getByLabelText("Save status")).toHaveTextContent("saving");

  act(() => vi.runAllTimers());
  expect(writes).toHaveLength(1);
  expect(JSON.parse(writes[0]!.value)).toMatchObject({ learnerLevel: "ms3" });
  expect(screen.getByLabelText("Save status")).toHaveTextContent("saved");
});

test("unmount clears a pending save timer", () => {
  vi.useFakeTimers();
  const { storage, writes } = makeTrackingStorage();
  const view = renderApp(<ProviderProbe />, {
    storage,
    previewSelection: NO_LEVEL,
  });

  fireEvent.click(screen.getByRole("button", { name: "Set resident" }));
  view.unmount();
  act(() => vi.runAllTimers());
  expect(writes).toEqual([]);
});

test("selectFacts stably deduplicates and filters IDs without persisting UI state", () => {
  vi.useFakeTimers();
  const { storage, writes } = makeTrackingStorage();
  renderApp(<ProviderProbe />, { storage, previewSelection: NO_LEVEL });

  fireEvent.click(screen.getByRole("button", { name: "Select facts" }));
  act(() => vi.runAllTimers());

  expect(screen.getByLabelText("Selected facts")).toHaveTextContent("F02,F01");
  expect(screen.getByLabelText("Save status")).toHaveTextContent("idle");
  expect(writes).toEqual([]);
});

test("revealFact selects exactly one fact, opens the panel, and increments repeat requests", () => {
  const { storage, writes } = makeTrackingStorage();
  renderApp(<ProviderProbe />, { storage, previewSelection: NO_LEVEL });

  fireEvent.click(screen.getByRole("button", { name: "Select facts" }));
  fireEvent.click(screen.getByRole("button", { name: "Reveal F01" }));
  expect(screen.getByLabelText("Selected facts")).toHaveTextContent("F01");
  expect(screen.getByLabelText("Evidence panel open")).toHaveTextContent(
    "true",
  );
  expect(screen.getByLabelText("Evidence focus request")).toHaveTextContent(
    "F01:1",
  );

  fireEvent.click(screen.getByRole("button", { name: "Reveal F01" }));
  expect(screen.getByLabelText("Evidence focus request")).toHaveTextContent(
    "F01:2",
  );
  expect(writes).toEqual([]);
});

test("the evidence panel controller opens and closes independently of workspace persistence", () => {
  const { storage, writes } = makeTrackingStorage();
  renderApp(<ProviderProbe />, { storage, previewSelection: NO_LEVEL });
  fireEvent.click(screen.getByRole("button", { name: "Open evidence" }));
  expect(screen.getByLabelText("Evidence panel open")).toHaveTextContent(
    "true",
  );
  fireEvent.click(screen.getByRole("button", { name: "Close evidence" }));
  expect(screen.getByLabelText("Evidence panel open")).toHaveTextContent(
    "false",
  );
  expect(writes).toEqual([]);
});

test("revealFact rejects an unknown fact ID", () => {
  const wrapper = ({ children }: PropsWithChildren) => (
    <WorkspaceProvider
      initialWorkspace={makeWorkspace()}
      storage={makeMemoryStorage()}
      previewSelection={NO_LEVEL}
    >
      {children}
    </WorkspaceProvider>
  );
  const { result } = renderHook(() => useWorkspace(), { wrapper });
  expect(() => act(() => result.current.revealFact("F99"))).toThrow(
    "Unknown fact F99",
  );
});

test("non-persisted evidence UI state starts clean after remount", () => {
  const stored = makeWorkspace();
  const storage = makeMemoryStorage({
    [WORKSPACE_KEY]: JSON.stringify(stored),
  });
  const first = renderApp(<ProviderProbe />, {
    storage,
    previewSelection: NO_LEVEL,
  });
  fireEvent.click(screen.getByRole("button", { name: "Reveal F01" }));
  first.unmount();

  renderApp(<ProviderProbe />, { storage, previewSelection: NO_LEVEL });
  expect(screen.getByLabelText("Selected facts")).toHaveTextContent("");
  expect(screen.getByLabelText("Evidence panel open")).toHaveTextContent(
    "false",
  );
  expect(screen.getByLabelText("Evidence focus request")).toHaveTextContent(
    "none",
  );
});

test("useWorkspace throws its exact error outside the provider", () => {
  expect(() => renderHook(() => useWorkspace())).toThrow(
    "useWorkspace must be used inside WorkspaceProvider",
  );
});
