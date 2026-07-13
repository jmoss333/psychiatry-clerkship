import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { WorkspaceState } from "../domain/model";
import { nextFactId } from "../domain/factEditing";
import { WORKSPACE_KEY } from "../domain/persistence";
import {
  makeAcknowledgedWorkspace,
  makeMemoryStorage,
  makeThrowingStorage,
} from "../test/fixtures";
import { renderApp } from "../test/renderApp";
import { useWorkspace } from "../state/useWorkspace";
import { EvidenceDrawer } from "./EvidenceDrawer";
import { FactChip } from "./ui/FactChip";

function WorkspaceSnapshot() {
  const { workspace } = useWorkspace();
  return (
    <output aria-label="Workspace snapshot">{JSON.stringify(workspace)}</output>
  );
}

function PersistenceSnapshot() {
  const { persistenceError } = useWorkspace();
  return (
    <output aria-label="Persistence error">{persistenceError ?? "none"}</output>
  );
}

function readWorkspace(): WorkspaceState {
  return JSON.parse(
    screen.getByLabelText("Workspace snapshot").textContent ?? "",
  ) as WorkspaceState;
}

function drawerTable() {
  return screen.getByRole("table", { name: "Case facts" });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fact identity, rows, filters, and selection", () => {
  test("generates the next stable Fact ID from the highest numeric suffix", () => {
    const facts = makeAcknowledgedWorkspace().facts;
    expect(nextFactId(facts)).toBe("F11");
    expect(
      nextFactId([
        ...facts,
        { ...facts[0]!, id: "F22" },
        { ...facts[0]!, id: "custom" },
      ]),
    ).toBe("F23");
  });

  test("renders the ten canonical fact rows with complete visible metadata", () => {
    renderApp(<EvidenceDrawer />);

    const rows = within(drawerTable()).getAllByRole("row");
    expect(rows).toHaveLength(10);
    const row = within(drawerTable()).getByRole("row", { name: /F04/ });
    expect(row).toHaveAttribute("data-fact-id", "F04");
    expect(row).toHaveAttribute("tabindex", "-1");
    expect(row).toHaveTextContent(
      "Patient reports sleeping about two hours nightly.",
    );
    expect(row).toHaveTextContent("Patient report");
    expect(row).toHaveTextContent("Moderate");
    expect(row).toHaveTextContent("Confirmed");
    expect(row).toHaveTextContent("8 days before current presentation");
  });

  test("filters facts by full text, source, reliability, and selected-only state", async () => {
    const user = userEvent.setup();
    renderApp(<EvidenceDrawer />);

    await user.type(
      screen.getByRole("searchbox", { name: "Search facts" }),
      "rapid",
    );
    expect(within(drawerTable()).getAllByRole("row")).toHaveLength(1);
    expect(
      within(drawerTable()).getByRole("row", { name: /F08/ }),
    ).toBeVisible();

    await user.clear(screen.getByRole("searchbox", { name: "Search facts" }));
    await user.selectOptions(
      screen.getByLabelText("Filter by source"),
      "direct_observation",
    );
    expect(within(drawerTable()).getAllByRole("row")).toHaveLength(2);
    expect(
      within(drawerTable()).getByRole("row", { name: /F07/ }),
    ).toBeVisible();
    expect(
      within(drawerTable()).getByRole("row", { name: /F08/ }),
    ).toBeVisible();

    await user.selectOptions(screen.getByLabelText("Filter by source"), "all");
    await user.selectOptions(
      screen.getByLabelText("Filter by reliability"),
      "high",
    );
    expect(within(drawerTable()).getAllByRole("row")).toHaveLength(2);

    await user.selectOptions(
      screen.getByLabelText("Filter by reliability"),
      "all",
    );
    await user.click(screen.getByRole("checkbox", { name: /Select F04/ }));
    await user.click(screen.getByRole("checkbox", { name: /Select F05/ }));
    await user.click(
      screen.getByRole("checkbox", { name: "Show selected facts only" }),
    );
    expect(within(drawerTable()).getAllByRole("row")).toHaveLength(2);
    expect(
      within(drawerTable()).getByRole("row", { name: /F04/ }),
    ).toBeVisible();
    expect(
      within(drawerTable()).getByRole("row", { name: /F05/ }),
    ).toBeVisible();
  });

  test("selects and deselects multiple facts without persistence or drag and drop", async () => {
    const user = userEvent.setup();
    const storage = makeMemoryStorage();
    renderApp(<EvidenceDrawer />, { storage });

    const f04 = screen.getByRole("checkbox", { name: /Select F04/ });
    const f05 = screen.getByRole("checkbox", { name: /Select F05/ });
    await user.click(f04);
    await user.click(f05);
    expect(screen.getByText("2 facts selected")).toBeVisible();
    expect(f04).toBeChecked();
    expect(f05).toBeChecked();

    await user.click(f04);
    expect(screen.getByText("1 fact selected")).toBeVisible();
    expect(f04).not.toBeChecked();
    expect(f05).toBeChecked();
    expect(storage.getItem(WORKSPACE_KEY)).toBeNull();
    expect(screen.queryByText(/drag/i)).not.toBeInTheDocument();
  });

  test("reveals a filtered-out fact, highlights every citation, and focuses and scrolls its exact row", async () => {
    const user = userEvent.setup();
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    renderApp(
      <>
        <FactChip factId="F04" />
        <FactChip factId="F04" />
        <EvidenceDrawer />
      </>,
    );

    await user.type(
      screen.getByRole("searchbox", { name: "Search facts" }),
      "rapid",
    );
    expect(
      within(drawerTable()).queryByRole("row", { name: /F04/ }),
    ).toBeNull();
    await user.click(screen.getAllByRole("button", { name: "F04" })[0]!);

    for (const chip of screen.getAllByRole("button", { name: "F04" })) {
      expect(chip).toHaveAttribute("aria-pressed", "true");
    }
    const row = await within(drawerTable()).findByRole("row", { name: /F04/ });
    await waitFor(() => expect(row).toHaveFocus());
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });

    await user.selectOptions(
      screen.getByLabelText("Filter by source"),
      "direct_observation",
    );
    expect(
      within(drawerTable()).queryByRole("row", { name: /F04/ }),
    ).toBeNull();
  });
});

describe("fact acknowledgement and paired fact/timeline editing", () => {
  test("requires acknowledgement before the first edit, persists the raw key, and bypasses the gate later", async () => {
    const user = userEvent.setup();
    const storage = makeMemoryStorage();
    renderApp(<EvidenceDrawer />, { storage });

    const editF01 = screen.getByRole("button", { name: "Edit F01" });
    await user.click(editF01);
    const gate = screen.getByRole("dialog", { name: "Fictional data only" });
    expect(gate).toBeVisible();
    expect(
      within(gate).getByText("I will use fictional educational data only."),
    ).toBeVisible();

    await user.click(
      within(gate).getByRole("button", {
        name: "Continue with fictional data",
      }),
    );
    expect(
      await screen.findByRole("dialog", { name: "Edit F01" }),
    ).toBeVisible();
    await waitFor(() => {
      const stored = storage.getItem(WORKSPACE_KEY);
      expect(stored).not.toBeNull();
      expect(JSON.parse(stored ?? "{}")).toMatchObject({
        syntheticDataAcknowledged: true,
      });
    });

    await user.click(
      screen.getByRole("button", { name: "Cancel fact editing" }),
    );
    await user.click(screen.getByRole("button", { name: "Edit F02" }));
    expect(
      screen.queryByRole("dialog", { name: "Fictional data only" }),
    ).toBeNull();
    expect(screen.getByRole("dialog", { name: "Edit F02" })).toBeVisible();
  });

  test("Cancel and Escape discard the gate continuation and return focus to the exact edit trigger", async () => {
    const user = userEvent.setup();
    renderApp(<EvidenceDrawer />);

    const editF01 = screen.getByRole("button", { name: "Edit F01" });
    await user.click(editF01);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: "Edit F01" })).toBeNull();
    expect(editF01).toHaveFocus();

    const editF02 = screen.getByRole("button", { name: "Edit F02" });
    await user.click(editF02);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Edit F02" })).toBeNull();
    expect(editF02).toHaveFocus();
  });

  test("adds a validated fact and paired learner-edited timeline item without leaking lane or order onto the fact", async () => {
    const user = userEvent.setup();
    renderApp(
      <>
        <EvidenceDrawer />
        <WorkspaceSnapshot />
      </>,
      { workspace: makeAcknowledgedWorkspace() },
    );

    await user.click(
      screen.getByRole("button", { name: "Add fictional fact" }),
    );
    const editor = screen.getByRole("dialog", { name: "Add fictional fact" });
    expect(within(editor).getByLabelText("Fact ID")).toHaveValue("F11");
    expect(within(editor).getByLabelText("Fact ID")).toHaveAttribute(
      "readonly",
    );
    await user.type(
      within(editor).getByLabelText("Fact text"),
      "Synthetic follow-up observation.",
    );
    await user.selectOptions(
      within(editor).getByLabelText("Source"),
      "objective_data",
    );
    await user.selectOptions(
      within(editor).getByLabelText("Reliability"),
      "high",
    );
    await user.selectOptions(
      within(editor).getByLabelText("Certainty"),
      "probable",
    );
    await user.selectOptions(
      within(editor).getByLabelText("Kind"),
      "medical_event",
    );
    await user.type(
      within(editor).getByLabelText("Start"),
      "about 2 weeks before current presentation",
    );
    await user.type(
      within(editor).getByLabelText("End"),
      "current presentation",
    );
    await user.selectOptions(
      within(editor).getByLabelText("Temporal precision"),
      "month",
    );
    await user.type(
      within(editor).getByLabelText("Tags"),
      " follow-up, synthetic, follow-up,  ",
    );
    await user.type(
      within(editor).getByLabelText("Timeline label"),
      "Synthetic follow-up interval",
    );
    await user.selectOptions(
      within(editor).getByLabelText("Timeline lane"),
      "medical_neurologic",
    );
    await user.clear(
      within(editor).getByLabelText("Visible time-column order"),
    );
    await user.type(
      within(editor).getByLabelText("Visible time-column order"),
      "7",
    );
    await user.click(within(editor).getByRole("button", { name: "Save fact" }));

    const workspace = readWorkspace();
    const fact = workspace.facts.find((item) => item.id === "F11");
    const timelineItem = workspace.timelineItems.find(
      (item) => item.id === "timeline-F11",
    );
    expect(fact).toEqual({
      id: "F11",
      kind: "medical_event",
      text: "Synthetic follow-up observation.",
      source: "objective_data",
      reliability: "high",
      certainty: "probable",
      start: "about 2 weeks before current presentation",
      end: "current presentation",
      temporalPrecision: "month",
      tags: ["follow-up", "synthetic"],
    });
    expect(fact).not.toHaveProperty("lane");
    expect(fact).not.toHaveProperty("sortOrder");
    expect(timelineItem).toMatchObject({
      id: "timeline-F11",
      factIds: ["F11"],
      lane: "medical_neurologic",
      label: "Synthetic follow-up interval",
      start: "about 2 weeks before current presentation",
      end: "current presentation",
      approximate: true,
      learnerEdited: true,
      sortOrder: 7,
    });
  });

  test("edits the existing fact and paired timeline item while preserving untouched fields", async () => {
    const user = userEvent.setup();
    const workspace = makeAcknowledgedWorkspace();
    workspace.facts[0] = {
      ...workspace.facts[0]!,
      end: "custom fact end",
      tags: ["baseline", "collateral"],
    };
    workspace.timelineItems[0] = {
      ...workspace.timelineItems[0]!,
      label: "  Custom timeline label  ",
      start: "custom timeline start",
      end: "custom timeline end",
      approximate: false,
      episodeId: "episode-1",
      factIds: ["F01", "F02"],
      sortOrder: 17,
    };
    renderApp(
      <>
        <EvidenceDrawer />
        <WorkspaceSnapshot />
      </>,
      { workspace },
    );

    await user.click(screen.getByRole("button", { name: "Edit F01" }));
    const editor = screen.getByRole("dialog", { name: "Edit F01" });
    expect(within(editor).getByLabelText("Fact ID")).toHaveAttribute(
      "readonly",
    );
    await user.clear(within(editor).getByLabelText("Fact text"));
    await user.type(
      within(editor).getByLabelText("Fact text"),
      "Edited synthetic collateral fact.",
    );
    await user.selectOptions(
      within(editor).getByLabelText("Timeline lane"),
      "stressors",
    );
    await user.click(within(editor).getByRole("button", { name: "Save fact" }));

    const saved = readWorkspace();
    expect(saved.facts).toHaveLength(10);
    expect(saved.facts[0]).toMatchObject({
      id: "F01",
      text: "Edited synthetic collateral fact.",
      end: "custom fact end",
      tags: ["baseline", "collateral"],
    });
    expect(saved.facts[0]).not.toHaveProperty("lane");
    expect(saved.facts[0]).not.toHaveProperty("sortOrder");
    expect(saved.timelineItems[0]).toMatchObject({
      id: "timeline-F01",
      label: "  Custom timeline label  ",
      start: "custom timeline start",
      end: "custom timeline end",
      approximate: false,
      episodeId: "episode-1",
      factIds: ["F01", "F02"],
      lane: "stressors",
      sortOrder: 17,
      learnerEdited: true,
    });
  });

  test("rejects an invalid paired timeline draft before dispatching either save action", async () => {
    const user = userEvent.setup();
    renderApp(
      <>
        <EvidenceDrawer />
        <WorkspaceSnapshot />
      </>,
      { workspace: makeAcknowledgedWorkspace() },
    );
    const before = readWorkspace();

    await user.click(screen.getByRole("button", { name: "Edit F01" }));
    const editor = screen.getByRole("dialog", { name: "Edit F01" });
    await user.clear(within(editor).getByLabelText("Fact text"));
    await user.type(
      within(editor).getByLabelText("Fact text"),
      "This edit must remain atomic.",
    );
    await user.clear(
      within(editor).getByLabelText("Visible time-column order"),
    );
    await user.click(within(editor).getByRole("button", { name: "Save fact" }));

    expect(within(editor).getByRole("alert")).toBeVisible();
    expect(
      within(editor).getByLabelText("Visible time-column order"),
    ).toHaveAttribute("aria-invalid", "true");
    expect(within(editor).getByLabelText("Fact text")).not.toHaveAttribute(
      "aria-invalid",
    );
    expect(readWorkspace()).toEqual(before);
  });

  test("rejects a colliding generated timeline ID without overwriting the existing item", async () => {
    const user = userEvent.setup();
    const workspace = makeAcknowledgedWorkspace();
    workspace.timelineItems.push({
      ...workspace.timelineItems[0]!,
      id: "timeline-F11",
      factIds: ["F01"],
    });
    renderApp(
      <>
        <EvidenceDrawer />
        <WorkspaceSnapshot />
      </>,
      { workspace },
    );
    const before = readWorkspace();

    await user.click(
      screen.getByRole("button", { name: "Add fictional fact" }),
    );
    const editor = screen.getByRole("dialog", { name: "Add fictional fact" });
    await user.type(
      within(editor).getByLabelText("Fact text"),
      "Collision must not partially save.",
    );
    await user.click(within(editor).getByRole("button", { name: "Save fact" }));

    expect(within(editor).getByRole("alert")).toHaveTextContent(
      "Timeline ID timeline-F11 is already in use",
    );
    expect(readWorkspace()).toEqual(before);
  });

  test("rejects ambiguous existing timeline pairings without updating an arbitrary item", async () => {
    const user = userEvent.setup();
    const workspace = makeAcknowledgedWorkspace();
    workspace.timelineItems = workspace.timelineItems.filter(
      (item) => item.id !== "timeline-F01",
    );
    workspace.timelineItems.push(
      {
        ...workspace.timelineItems[0]!,
        id: "custom-F01-a",
        factIds: ["F01"],
      },
      {
        ...workspace.timelineItems[0]!,
        id: "custom-F01-b",
        factIds: ["F01"],
      },
    );
    renderApp(
      <>
        <EvidenceDrawer />
        <WorkspaceSnapshot />
      </>,
      { workspace },
    );
    const before = readWorkspace();

    await user.click(screen.getByRole("button", { name: "Edit F01" }));
    const editor = screen.getByRole("dialog", { name: "Edit F01" });
    await user.click(within(editor).getByRole("button", { name: "Save fact" }));

    expect(within(editor).getByRole("alert")).toHaveTextContent(
      "Fact F01 has multiple timeline items",
    );
    expect(readWorkspace()).toEqual(before);
  });

  test("rejects 281 visible characters before either half of the paired save is dispatched", async () => {
    const user = userEvent.setup();
    renderApp(
      <>
        <EvidenceDrawer />
        <WorkspaceSnapshot />
      </>,
      { workspace: makeAcknowledgedWorkspace() },
    );
    const before = readWorkspace();

    await user.click(screen.getByRole("button", { name: "Edit F01" }));
    const editor = screen.getByRole("dialog", { name: "Edit F01" });
    const text = within(editor).getByLabelText("Fact text");
    await user.clear(text);
    await user.type(text, "x".repeat(281));
    expect(text).toHaveValue("x".repeat(281));
    await user.click(within(editor).getByRole("button", { name: "Save fact" }));

    expect(within(editor).getByRole("alert")).toHaveTextContent(
      "Fact text must be at most 280 characters",
    );
    expect(readWorkspace()).toEqual(before);
  });

  test("shows no real-patient, facility, transfer, or PHI-detection controls or claims", async () => {
    const user = userEvent.setup();
    renderApp(<EvidenceDrawer />, { workspace: makeAcknowledgedWorkspace() });
    await user.click(
      screen.getByRole("button", { name: "Add fictional fact" }),
    );
    const editor = screen.getByRole("dialog", { name: "Add fictional fact" });

    for (const prohibited of [
      /patient name/i,
      /MRN/i,
      /date of birth|DOB/i,
      /facility/i,
      /upload/i,
      /import/i,
      /clipboard|paste/i,
      /detect.*PHI|prevent.*PHI/i,
    ]) {
      expect(
        within(editor).queryByRole("textbox", { name: prohibited }),
      ).toBeNull();
      expect(
        within(editor).queryByRole("button", { name: prohibited }),
      ).toBeNull();
      expect(within(editor).queryByText(prohibited)).toBeNull();
    }
  });

  test("traps editor focus and returns it to the exact trigger after Escape", async () => {
    const user = userEvent.setup();
    renderApp(<EvidenceDrawer />, { workspace: makeAcknowledgedWorkspace() });
    const trigger = screen.getByRole("button", { name: "Edit F01" });
    await user.click(trigger);
    const editor = screen.getByRole("dialog", { name: "Edit F01" });
    const cancel = within(editor).getByRole("button", {
      name: "Cancel fact editing",
    });
    cancel.focus();
    await user.tab();
    expect(within(editor).getByLabelText("Fact ID")).toHaveFocus();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  test("keeps a validated paired edit in memory when local persistence fails", async () => {
    const user = userEvent.setup();
    renderApp(
      <>
        <EvidenceDrawer />
        <WorkspaceSnapshot />
        <PersistenceSnapshot />
      </>,
      {
        workspace: makeAcknowledgedWorkspace(),
        storage: makeThrowingStorage({ set: new Error("Quota exceeded") }),
      },
    );
    await user.click(screen.getByRole("button", { name: "Edit F01" }));
    const editor = screen.getByRole("dialog", { name: "Edit F01" });
    await user.clear(within(editor).getByLabelText("Fact text"));
    await user.type(
      within(editor).getByLabelText("Fact text"),
      "In-memory synthetic edit.",
    );
    await user.click(within(editor).getByRole("button", { name: "Save fact" }));

    expect(readWorkspace().facts[0]?.text).toBe("In-memory synthetic edit.");
    expect(readWorkspace().timelineItems[0]?.learnerEdited).toBe(true);
    await waitFor(() =>
      expect(screen.getByLabelText("Persistence error")).toHaveTextContent(
        "Local saving is unavailable; work will be lost on reload.",
      ),
    );
  });

  test("persists the complete paired save and restores it on a full provider reload", async () => {
    const user = userEvent.setup();
    const storage = makeMemoryStorage();
    const first = renderApp(<EvidenceDrawer />, {
      workspace: makeAcknowledgedWorkspace(),
      storage,
    });

    await user.click(
      screen.getByRole("button", { name: "Add fictional fact" }),
    );
    const editor = screen.getByRole("dialog", { name: "Add fictional fact" });
    await user.type(
      within(editor).getByLabelText("Fact text"),
      "Reloaded synthetic fact.",
    );
    await user.type(
      within(editor).getByLabelText("Timeline label"),
      "Reloaded synthetic timeline item",
    );
    await user.click(within(editor).getByRole("button", { name: "Save fact" }));
    await waitFor(() => {
      const stored = storage.getItem(WORKSPACE_KEY);
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored ?? "{}") as WorkspaceState;
      expect(parsed.facts.some((fact) => fact.id === "F11")).toBe(true);
      expect(
        parsed.timelineItems.some((item) => item.id === "timeline-F11"),
      ).toBe(true);
    });

    first.unmount();
    renderApp(
      <>
        <EvidenceDrawer />
        <WorkspaceSnapshot />
      </>,
      { storage },
    );
    expect(
      await within(drawerTable()).findByRole("row", { name: /F11/ }),
    ).toHaveTextContent("Reloaded synthetic fact.");
    const restored = readWorkspace();
    expect(
      restored.timelineItems.find((item) => item.id === "timeline-F11"),
    ).toMatchObject({
      label: "Reloaded synthetic timeline item",
      learnerEdited: true,
    });
  });
});
