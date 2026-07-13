import rawCase from "../content/cases/first-episode.json";
import { createSeedWorkspace } from "../content/loadContent";
import type { WorkspaceState } from "../domain/model";
import { parseCaseDefinition } from "../domain/schemas";

export function makeWorkspace(
  level: "ms3" | "resident" = "ms3",
): WorkspaceState {
  return createSeedWorkspace(parseCaseDefinition(rawCase), level);
}

export function makeAcknowledgedWorkspace(): WorkspaceState {
  return { ...makeWorkspace(), syntheticDataAcknowledged: true };
}

export function makeMemoryStorage(seed: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(seed));
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

export function makeThrowingStorage(failure: {
  get?: Error;
  set?: Error;
  remove?: Error;
}): Storage {
  const storage = makeMemoryStorage();
  return {
    get length() {
      return storage.length;
    },
    clear: () => storage.clear(),
    getItem: (key) => {
      if (failure.get) throw failure.get;
      return storage.getItem(key);
    },
    key: (index) => storage.key(index),
    removeItem: (key) => {
      if (failure.remove) throw failure.remove;
      storage.removeItem(key);
    },
    setItem: (key, value) => {
      if (failure.set) throw failure.set;
      storage.setItem(key, value);
    },
  };
}
