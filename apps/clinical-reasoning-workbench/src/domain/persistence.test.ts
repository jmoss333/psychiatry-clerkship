import { expect, test } from "vitest";
import {
  makeMemoryStorage,
  makeThrowingStorage,
  makeWorkspace,
} from "../test/fixtures";
import {
  WORKSPACE_KEY,
  loadWorkspace,
  resetStoredWorkspace,
  saveWorkspace,
} from "./persistence";

test("uses only the versioned reasoning-workbench storage key", () => {
  const storage = makeMemoryStorage();
  saveWorkspace(storage, makeWorkspace());
  expect(WORKSPACE_KEY).toBe("cw_reason_workbench_v1");
  expect(storage.key(0)).toBe("cw_reason_workbench_v1");
  expect(storage.getItem("cw_reason_v1")).toBeNull();
});

test("returns missing when no stored workspace exists", () => {
  expect(loadWorkspace(makeMemoryStorage())).toEqual({ status: "missing" });
});

test("round-trips a validated workspace", () => {
  const storage = makeMemoryStorage();
  const workspace = makeWorkspace("resident");
  workspace.syntheticDataAcknowledged = true;
  saveWorkspace(storage, workspace);

  expect(loadWorkspace(storage)).toEqual({ status: "loaded", workspace });
});

test("invalid persisted data is retained until explicit successful reset", () => {
  const raw = '{"schemaVersion":99}';
  const storage = makeMemoryStorage({ [WORKSPACE_KEY]: raw });

  const result = loadWorkspace(storage);
  expect(result.status).toBe("invalid");
  expect(storage.getItem(WORKSPACE_KEY)).toBe(raw);

  resetStoredWorkspace(storage);
  expect(storage.getItem(WORKSPACE_KEY)).toBeNull();
});

test("malformed JSON is invalid without being deleted", () => {
  const raw = "{not-json";
  const storage = makeMemoryStorage({ [WORKSPACE_KEY]: raw });
  expect(loadWorkspace(storage)).toMatchObject({ status: "invalid" });
  expect(storage.getItem(WORKSPACE_KEY)).toBe(raw);
});

test("storage read failure returns unavailable instead of blocking the in-memory app", () => {
  const storage = makeThrowingStorage({
    get: new DOMException("Blocked", "SecurityError"),
  });
  expect(loadWorkspace(storage)).toEqual({
    status: "unavailable",
    message: "Blocked",
  });
});

test("a non-Error read failure uses the stable unavailable fallback", () => {
  const storage = makeMemoryStorage();
  storage.getItem = () => {
    throw "blocked";
  };
  expect(loadWorkspace(storage)).toEqual({
    status: "unavailable",
    message: "Local storage is unavailable",
  });
});

test("storage write failure is thrown distinctly from a read failure", () => {
  const storage = makeThrowingStorage({
    set: new Error("Quota exceeded"),
  });
  expect(loadWorkspace(storage)).toEqual({ status: "missing" });
  expect(() => saveWorkspace(storage, makeWorkspace())).toThrow(
    "Quota exceeded",
  );
});

test("saveWorkspace validates before changing stored data", () => {
  const original = JSON.stringify(makeWorkspace());
  const storage = makeMemoryStorage({ [WORKSPACE_KEY]: original });
  const invalid = makeWorkspace();
  invalid.timelineItems[0]!.factIds = ["F99"];

  expect(() => saveWorkspace(storage, invalid)).toThrow(/F99/);
  expect(storage.getItem(WORKSPACE_KEY)).toBe(original);
});

test.each([
  [
    "blank fact text",
    (workspace: ReturnType<typeof makeWorkspace>) => {
      workspace.facts[0]!.text = "   ";
    },
  ],
  [
    "blank timeline text",
    (workspace: ReturnType<typeof makeWorkspace>) => {
      workspace.timelineItems[0]!.label = "   ";
    },
  ],
] as const)(
  "saveWorkspace rejects %s before serialization and preserves a loadable prior value",
  (_label, invalidate) => {
    const originalWorkspace = makeWorkspace();
    const original = JSON.stringify(originalWorkspace);
    const storage = makeMemoryStorage({ [WORKSPACE_KEY]: original });
    const invalid = makeWorkspace();
    invalidate(invalid);

    expect(() => saveWorkspace(storage, invalid)).toThrow(/text is required/);
    expect(storage.getItem(WORKSPACE_KEY)).toBe(original);
    expect(loadWorkspace(storage)).toEqual({
      status: "loaded",
      workspace: originalWorkspace,
    });
  },
);

test.each([
  [
    "blank fact text",
    (workspace: ReturnType<typeof makeWorkspace>) => {
      workspace.facts[0]!.text = "   ";
    },
  ],
  [
    "blank timeline text",
    (workspace: ReturnType<typeof makeWorkspace>) => {
      workspace.timelineItems[0]!.label = "   ";
    },
  ],
] as const)(
  "loadWorkspace rejects and retains stored %s",
  (_label, invalidate) => {
    const invalid = makeWorkspace();
    invalidate(invalid);
    const raw = JSON.stringify(invalid);
    const storage = makeMemoryStorage({ [WORKSPACE_KEY]: raw });

    expect(loadWorkspace(storage)).toMatchObject({ status: "invalid" });
    expect(storage.getItem(WORKSPACE_KEY)).toBe(raw);
  },
);

test("reset removal failure throws and retains the stored value", () => {
  const storage = makeThrowingStorage({
    remove: new Error("Removal blocked"),
  });
  const raw = '{"schemaVersion":99}';
  storage.setItem(WORKSPACE_KEY, raw);

  expect(() => resetStoredWorkspace(storage)).toThrow("Removal blocked");
  expect(storage.getItem(WORKSPACE_KEY)).toBe(raw);
});
