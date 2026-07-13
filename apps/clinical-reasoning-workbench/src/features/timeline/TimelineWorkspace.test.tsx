import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { App } from "../../App";
import { VISIBLE_TIME_COLUMNS } from "../../domain/factEditing";
import { loadWorkspace, WORKSPACE_KEY } from "../../domain/persistence";
import {
  makeAcknowledgedWorkspace,
  makeMemoryStorage,
  makeWorkspace,
} from "../../test/fixtures";
import { renderApp } from "../../test/renderApp";
import { TimelineWorkspace } from "./TimelineWorkspace";

const LANE_LABELS = [
  "Mood",
  "Psychosis",
  "Sleep and energy",
  "Anxiety and trauma",
  "Substance use",
  "Medication",
  "Medical and neurologic",
  "Function",
  "Stressors",
  "Treatment",
] as const;

const RELATION_KINDS = [
  "preceded",
  "coincided",
  "continued_after",
  "occurred_only_during",
  "improved_after",
  "worsened_after",
  "independent_of",
  "unclear",
] as const;

const CANONICAL_TIMELINE_LABELS = [
  "Collateral describes academic decline and social withdrawal.",
  "Patient reports increasingly heavy cannabis use.",
  "Patient reports that neighbors are monitoring him.",
  "Patient reports sleeping about two hours nightly.",
  "Patient reports no fatigue despite reduced sleep.",
  "Collateral reports increased spending.",
  "Patient makes grandiose statements.",
  "Speech is rapid.",
  "Patient expresses persecutory beliefs.",
  "The chart describes the current presentation as agitated.",
] as const;

const originalMatchMedia = window.matchMedia;

function installCompactViewport(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string): MediaQueryList => ({
      matches: query === "(max-width: 1099px)" ? matches : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

async function saveExistingEvent(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole("button", { name: "Edit F06 timeline event" }),
  );
  const label = screen.getByLabelText("Timeline label");
  await user.clear(label);
  await user.type(label, "Learner saved spending event");
  await user.selectOptions(screen.getByLabelText("Timeline lane"), "mood");
  await user.selectOptions(screen.getByLabelText("Visible time column"), "4");
  await user.type(screen.getByLabelText("Episode ID"), "activation episode");
  await user.click(screen.getByRole("button", { name: "Save event" }));
}

async function saveRelation(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole("button", { name: "Add temporal relationship" }),
  );
  await user.selectOptions(screen.getByLabelText("From fact"), "F02");
  await user.selectOptions(screen.getByLabelText("Relationship"), "preceded");
  await user.selectOptions(screen.getByLabelText("To fact"), "F03");
  await user.click(screen.getByRole("button", { name: "Save relationship" }));
}

afterEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: originalMatchMedia,
  });
  vi.restoreAllMocks();
});

test("renders the exact ten lanes and five shared time columns as a semantic timeline table", () => {
  renderApp(<TimelineWorkspace />);

  const table = screen.getByRole("table", { name: "Psychiatric timeline" });
  const scroller = screen.getByRole("region", {
    name: "Psychiatric timeline grid",
  });
  expect(scroller).toHaveAttribute("tabindex", "0");
  expect(scroller).toContainElement(table);
  expect(
    within(table)
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent),
  ).toEqual([
    "Timeline lane",
    ...VISIBLE_TIME_COLUMNS.map((column) => column.label),
  ]);
  expect(
    within(table)
      .getAllByRole("rowheader")
      .map((cell) => cell.textContent),
  ).toEqual(LANE_LABELS);
  expect(scroller).toHaveClass("timeline-grid-scroll");
});

test("shows all canonical seed events without concept-only clinical copy", () => {
  renderApp(<TimelineWorkspace />);

  for (const label of CANONICAL_TIMELINE_LABELS) {
    expect(screen.getByText(label)).toBeVisible();
  }
  expect(screen.queryByText(/Lower mood, less interest/i)).toBeNull();
  expect(screen.queryByText(/More fatigued/i)).toBeNull();
  expect(screen.queryByText(/Elevated, irritable/i)).toBeNull();
  expect(screen.queryByText(/Marked impairment; conflict/i)).toBeNull();
});

test("provides text-labelled solid, dotted, filled, and outlined display semantics", () => {
  const workspace = makeWorkspace();
  workspace.timelineItems.find((item) => item.id === "timeline-F04")!.end =
    "current presentation";
  const { container } = renderApp(<TimelineWorkspace />, { workspace });

  const legend = screen.getByRole("list", { name: "Timeline display key" });
  expect(within(legend).getByText("Ongoing — solid line")).toBeVisible();
  expect(
    within(legend).getByText("Probable or uncertain — dotted line"),
  ).toBeVisible();
  expect(within(legend).getByText("Point event — filled dot")).toBeVisible();
  expect(within(legend).getByText("Approximate — outlined dot")).toBeVisible();
  for (const mark of document.querySelectorAll("[data-display-semantics]")) {
    expect(mark).toHaveAccessibleName();
  }
  expect(
    container.querySelector('[data-timeline-item-id="timeline-F04"]'),
  ).toHaveAttribute("data-display-semantics", "ongoing");
  expect(
    container.querySelector('[data-timeline-item-id="timeline-F07"]'),
  ).toHaveAttribute("data-display-semantics", "point");
});

test("requires the shared fictional-data acknowledgement before event-label editing", async () => {
  const user = userEvent.setup();
  renderApp(<TimelineWorkspace />);

  await user.click(
    screen.getByRole("button", { name: "Edit F06 timeline event" }),
  );

  expect(
    screen.getByRole("dialog", { name: "Fictional data only" }),
  ).toBeVisible();
  expect(
    screen.getByText("I will use fictional educational data only."),
  ).toBeVisible();
});

test("edits an event, preserves linked fields, and reloads its label, lane, column, and episode", async () => {
  const user = userEvent.setup();
  const storage = makeMemoryStorage();
  const workspace = makeAcknowledgedWorkspace();
  const seedItem = workspace.timelineItems.find(
    (item) => item.id === "timeline-F06",
  )!;
  seedItem.end = "current presentation";
  seedItem.approximate = true;
  const original = structuredClone(
    workspace.timelineItems.find((item) => item.id === "timeline-F06"),
  );
  const rendered = renderApp(<TimelineWorkspace />, { workspace, storage });

  await saveExistingEvent(user);
  expect(
    screen.getByRole("button", { name: "Edit F06 timeline event" }),
  ).toHaveFocus();
  await waitFor(() => expect(storage.getItem(WORKSPACE_KEY)).not.toBeNull());
  const loaded = loadWorkspace(storage);
  expect(loaded.status).toBe("loaded");
  if (loaded.status !== "loaded") throw new Error("Expected saved workspace");
  const saved = loaded.workspace.timelineItems.find(
    (item) => item.id === "timeline-F06",
  );
  expect(saved).toMatchObject({
    id: original?.id,
    factIds: original?.factIds,
    label: "Learner saved spending event",
    lane: "mood",
    sortOrder: 4,
    episodeId: "activation episode",
    learnerEdited: true,
  });
  expect(saved?.start).toBe(original?.start);
  expect(saved?.end).toBe(original?.end);
  expect(saved?.approximate).toBe(original?.approximate);

  rendered.unmount();
  renderApp(<TimelineWorkspace />, { storage });
  const mark = screen
    .getByText("Learner saved spending event")
    .closest("article");
  expect(mark).toHaveAttribute("data-episode-id", "activation episode");
  expect(screen.getByRole("row", { name: /Mood.*F06/ })).toBeVisible();
});

test("creates one manual event as one validated fact plus its paired timeline item", async () => {
  const user = userEvent.setup();
  const storage = makeMemoryStorage();
  renderApp(<TimelineWorkspace />, {
    workspace: makeAcknowledgedWorkspace(),
    storage,
  });

  await user.click(screen.getByRole("button", { name: "Add fictional event" }));
  expect(screen.getByLabelText("Fact ID")).toHaveValue("F11");
  await user.type(
    screen.getByLabelText("Fictional event fact"),
    "Learner-authored fictional follow-up event.",
  );
  await user.type(
    screen.getByLabelText("Timeline label"),
    "Learner saved follow-up label",
  );
  await user.selectOptions(screen.getByLabelText("Timeline lane"), "treatment");
  await user.selectOptions(screen.getByLabelText("Visible time column"), "4");
  await user.type(screen.getByLabelText("Episode ID"), "follow-up episode");
  await user.click(screen.getByRole("button", { name: "Save event" }));

  expect(screen.getByText("Learner saved follow-up label")).toBeVisible();
  await waitFor(() => expect(storage.getItem(WORKSPACE_KEY)).not.toBeNull());
  const loaded = loadWorkspace(storage);
  expect(loaded.status).toBe("loaded");
  if (loaded.status !== "loaded") throw new Error("Expected saved workspace");
  expect(
    loaded.workspace.facts.find((fact) => fact.id === "F11"),
  ).toMatchObject({
    id: "F11",
    text: "Learner-authored fictional follow-up event.",
  });
  expect(
    loaded.workspace.timelineItems.find((item) => item.id === "timeline-F11"),
  ).toMatchObject({
    factIds: ["F11"],
    label: "Learner saved follow-up label",
    lane: "treatment",
    sortOrder: 4,
    episodeId: "follow-up episode",
    learnerEdited: true,
  });
});

test("rejects an overlong episode visibly without partially saving a manual fact", async () => {
  const user = userEvent.setup();
  const storage = makeMemoryStorage();
  renderApp(<TimelineWorkspace />, {
    workspace: makeAcknowledgedWorkspace(),
    storage,
  });

  await user.click(screen.getByRole("button", { name: "Add fictional event" }));
  await user.type(
    screen.getByLabelText("Fictional event fact"),
    "Learner-authored fictional follow-up event.",
  );
  await user.selectOptions(screen.getByLabelText("Visible time column"), "4");
  fireEvent.change(screen.getByLabelText("Episode ID"), {
    target: { value: "e".repeat(81) },
  });
  await user.click(screen.getByRole("button", { name: "Save event" }));

  expect(screen.getByRole("alert")).toHaveTextContent(
    "Episode ID must be at most 80 characters",
  );
  expect(storage.getItem(WORKSPACE_KEY)).toBeNull();
  expect(
    within(
      screen.getByRole("table", { name: "Psychiatric timeline" }),
    ).queryByText("Learner-authored fictional follow-up event."),
  ).toBeNull();
});

test("offers all eight relation kinds and reports self-links and duplicate exact triples", async () => {
  const user = userEvent.setup();
  renderApp(<TimelineWorkspace />, { workspace: makeAcknowledgedWorkspace() });

  await user.click(
    screen.getByRole("button", { name: "Add temporal relationship" }),
  );
  const relationSelect =
    screen.getByLabelText<HTMLSelectElement>("Relationship");
  expect(
    Array.from(relationSelect.options).map((option) => option.value),
  ).toEqual(RELATION_KINDS);
  await user.selectOptions(screen.getByLabelText("From fact"), "F02");
  await user.selectOptions(screen.getByLabelText("To fact"), "F02");
  await user.click(screen.getByRole("button", { name: "Save relationship" }));
  expect(screen.getByRole("alert")).toHaveTextContent(
    "A temporal relationship cannot link a fact to itself",
  );

  await user.selectOptions(screen.getByLabelText("To fact"), "F03");
  await user.click(screen.getByRole("button", { name: "Save relationship" }));
  const savedRelation = screen.getByRole("listitem", {
    name: "F02 preceded F03",
  });
  expect(savedRelation).toBeVisible();
  await user.click(within(savedRelation).getByRole("button", { name: "F02" }));
  expect(savedRelation).toHaveClass("is-evidence-selected");

  await user.click(
    screen.getByRole("button", { name: "Add temporal relationship" }),
  );
  await user.selectOptions(screen.getByLabelText("From fact"), "F02");
  await user.selectOptions(screen.getByLabelText("Relationship"), "preceded");
  await user.selectOptions(screen.getByLabelText("To fact"), "F03");
  await user.click(screen.getByRole("button", { name: "Save relationship" }));
  expect(screen.getByRole("alert")).toHaveTextContent(
    "This exact temporal relationship already exists",
  );
});

test("saves a deterministic relation ID by keyboard and reloads the relationship", async () => {
  const user = userEvent.setup();
  const storage = makeMemoryStorage();
  const rendered = renderApp(<TimelineWorkspace />, {
    workspace: makeAcknowledgedWorkspace(),
    storage,
  });

  await saveRelation(user);
  expect(
    screen.getByRole("listitem", { name: "F02 preceded F03" }),
  ).toBeVisible();
  await waitFor(() => expect(storage.getItem(WORKSPACE_KEY)).not.toBeNull());
  const loaded = loadWorkspace(storage);
  expect(loaded.status).toBe("loaded");
  if (loaded.status !== "loaded") throw new Error("Expected saved workspace");
  expect(loaded.workspace.temporalRelations).toEqual([
    {
      id: "relation-001",
      fromFactId: "F02",
      toFactId: "F03",
      kind: "preceded",
    },
  ]);

  rendered.unmount();
  renderApp(<TimelineWorkspace />, { storage });
  expect(
    screen.getByRole("listitem", { name: "F02 preceded F03" }),
  ).toBeVisible();
  await user.click(
    screen.getByRole("button", {
      name: "Edit F02 preceded F03 relationship",
    }),
  );
  await user.selectOptions(screen.getByLabelText("Relationship"), "coincided");
  await user.click(screen.getByRole("button", { name: "Save relationship" }));
  expect(
    screen.getByRole("listitem", { name: "F02 coincided F03" }),
  ).toBeVisible();
  await waitFor(() => {
    const edited = loadWorkspace(storage);
    expect(edited.status).toBe("loaded");
    if (edited.status === "loaded") {
      expect(edited.workspace.temporalRelations[0]).toEqual({
        id: "relation-001",
        fromFactId: "F02",
        toFactId: "F03",
        kind: "coincided",
      });
    }
  });
});

test("chronology guidance stops relation prompts in either stored direction", () => {
  const workspace = makeWorkspace();
  workspace.temporalRelations = [
    {
      id: "relation-001",
      fromFactId: "F03",
      toFactId: "F02",
      kind: "continued_after",
    },
    {
      id: "relation-002",
      fromFactId: "F09",
      toFactId: "F07",
      kind: "independent_of",
    },
  ];
  renderApp(<App />, { workspace });

  const guidance = screen.getByRole("region", { name: "Chronology guidance" });
  expect(
    within(guidance).getByText("Which dates are approximate?"),
  ).toBeVisible();
  expect(
    within(guidance).queryByText(/Did increasing cannabis use precede/),
  ).toBeNull();
  expect(
    within(guidance).queryByText(
      /Did psychotic symptoms continue outside mood symptoms/,
    ),
  ).toBeNull();
});

test("chronology summary includes only learner-edited labels in stable column and source order", () => {
  const workspace = makeWorkspace();
  workspace.timelineItems[2] = {
    ...workspace.timelineItems[2]!,
    label: "Second same-column learner label",
    learnerEdited: true,
    sortOrder: 2,
  };
  workspace.timelineItems[0] = {
    ...workspace.timelineItems[0]!,
    label: "Earliest learner label",
    learnerEdited: true,
    sortOrder: 0,
  };
  workspace.timelineItems[1] = {
    ...workspace.timelineItems[1]!,
    label: "First same-column learner label",
    learnerEdited: true,
    sortOrder: 2,
  };
  renderApp(<App />, { workspace });

  const summary = screen.getByRole("list", {
    name: "Learner chronology summary",
  });
  expect(
    within(summary)
      .getAllByRole("listitem")
      .map((item) => item.textContent),
  ).toEqual([
    "Earliest learner labelF01",
    "First same-column learner labelF02",
    "Second same-column learner labelF03",
  ]);
  expect(within(summary).queryByText(/Bipolar I disorder/)).toBeNull();
  expect(within(summary).queryByText(CANONICAL_TIMELINE_LABELS[3])).toBeNull();
});

test("summary FactChip selection highlights only its grid mark/cell use and evidence row", async () => {
  const user = userEvent.setup();
  const workspace = makeWorkspace();
  const event = workspace.timelineItems.find(
    (item) => item.id === "timeline-F06",
  )!;
  event.learnerEdited = true;
  event.label = "Learner selected timeline event";
  const { container } = renderApp(<App />, { workspace });

  const guidance = screen.getByRole("region", { name: "Chronology guidance" });
  await user.click(within(guidance).getByRole("button", { name: "F06" }));

  const selectedMark = container.querySelector(
    '[data-timeline-item-id="timeline-F06"]',
  );
  expect(selectedMark).toHaveClass("is-evidence-selected");
  expect(selectedMark?.closest("td")).toHaveClass("is-evidence-selected");
  expect(screen.getByRole("row", { name: /Function.*F06/ })).not.toHaveClass(
    "is-evidence-selected",
  );
  expect(container.querySelector('[data-fact-id="F06"]')).toHaveClass(
    "is-evidence-selected",
  );
});

test("uses the existing teaching rail and compact Teaching overlay for chronology", async () => {
  installCompactViewport(true);
  const user = userEvent.setup();
  const { container } = renderApp(<App />);

  expect(container.querySelectorAll(".workspace-grid > *")).toHaveLength(3);
  expect(
    screen.queryByRole("region", { name: "Chronology guidance" }),
  ).toBeNull();
  await user.click(screen.getByRole("button", { name: "Teaching" }));
  const dialog = screen.getByRole("dialog", { name: "Teaching" });
  expect(
    within(dialog).getByRole("region", { name: "Chronology guidance" }),
  ).toBeVisible();
  expect(within(dialog).getByText("Chronology questions")).toBeVisible();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog", { name: "Teaching" })).toBeNull();
  expect(screen.getByRole("button", { name: "Teaching" })).toHaveFocus();
});

test("returns a compact chronology citation from Case facts to the reopened Teaching rail", async () => {
  installCompactViewport(true);
  const user = userEvent.setup();
  const workspace = makeWorkspace();
  workspace.timelineItems.find(
    (item) => item.id === "timeline-F06",
  )!.learnerEdited = true;
  renderApp(<App />, { workspace });

  await user.click(screen.getByRole("button", { name: "Teaching" }));
  const teaching = screen.getByRole("dialog", { name: "Teaching" });
  const citation = within(teaching).getByRole("button", { name: "F06" });
  await user.click(citation);

  const facts = screen.getByRole("dialog", { name: "Case facts" });
  expect(facts).toBeVisible();
  expect(screen.queryByRole("dialog", { name: "Teaching" })).toBeNull();
  await user.click(
    within(facts).getByRole("button", { name: "Close Case facts" }),
  );

  expect(screen.getByRole("dialog", { name: "Teaching" })).toBeVisible();
  expect(citation).toHaveFocus();
});
