import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { App } from "../App";
import { AppShell } from "./AppShell";
import { FactChip } from "./ui/FactChip";
import { LinkedText } from "./ui/LinkedText";
import { SourceReliability } from "./ui/SourceReliability";
import { WORKSPACE_KEY } from "../domain/persistence";
import { makeMemoryStorage, makeThrowingStorage } from "../test/fixtures";
import { renderApp } from "../test/renderApp";

const originalMatchMedia = window.matchMedia;
const originalLocalStorage = Object.getOwnPropertyDescriptor(
  window,
  "localStorage",
);

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

afterEach(() => {
  document.documentElement.removeAttribute("data-theme");
  if (originalLocalStorage) {
    Object.defineProperty(window, "localStorage", originalLocalStorage);
  }
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: originalMatchMedia,
  });
  vi.restoreAllMocks();
});

describe("semantic workbench shell", () => {
  test("exposes the four tabs with roving arrow, Home, and End navigation", async () => {
    const user = userEvent.setup();
    renderApp(<App />, { storage: makeMemoryStorage() });

    const timeline = screen.getByRole("tab", { name: "Timeline" });
    const mse = screen.getByRole("tab", { name: "MSE" });
    const differential = screen.getByRole("tab", { name: "Differential" });
    const challenge = screen.getByRole("tab", {
      name: "Challenge Diagnosis",
    });

    expect(timeline).toHaveAttribute("aria-controls", "panel-timeline");
    expect(timeline).toHaveAttribute("aria-selected", "true");
    timeline.focus();
    await user.keyboard("{ArrowRight}");
    expect(mse).toHaveFocus();
    expect(mse).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{End}");
    expect(challenge).toHaveFocus();
    await user.keyboard("{Home}");
    expect(timeline).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(challenge).toHaveFocus();
    expect(differential).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("tabpanel")).toHaveAttribute(
      "aria-labelledby",
      "tab-challenge",
    );
  });

  test("applies only valid parent-frame theme messages and mirrors cw_theme", () => {
    const themeStorage = makeMemoryStorage();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: themeStorage,
    });
    renderApp(<App />, { storage: makeMemoryStorage() });

    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "theme", mode: "dark" },
      }),
    );
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(themeStorage.getItem("cw_theme")).toBe("dark");

    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "theme", mode: "sepia" },
      }),
    );
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");

    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "theme", mode: "light" },
      }),
    );
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(themeStorage.getItem("cw_theme")).toBe("light");
  });

  test("shows reset recovery without rendering a partial workspace", () => {
    const storage = makeMemoryStorage({
      [WORKSPACE_KEY]: '{"schemaVersion":99}',
    });
    renderApp(<App />, { storage });

    expect(
      screen.getByRole("heading", {
        name: "Saved fictional workspace needs to be reset",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Reset fictional workspace" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("tab", { name: "Timeline" }),
    ).not.toBeInTheDocument();
  });

  test("keeps recovery visible and surfaces a reset-removal failure", async () => {
    const user = userEvent.setup();
    const storage = makeThrowingStorage({
      remove: new Error("Removal blocked"),
    });
    storage.setItem(WORKSPACE_KEY, '{"schemaVersion":99}');
    renderApp(<App />, { storage });

    await user.click(
      screen.getByRole("button", { name: "Reset fictional workspace" }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "The fictional workspace could not be reset.",
    );
    expect(
      screen.queryByRole("tab", { name: "Timeline" }),
    ).not.toBeInTheDocument();
  });

  test("provides skip navigation and a live local-save announcement", () => {
    renderApp(<App />, { storage: makeMemoryStorage() });

    expect(
      screen.getByRole("link", { name: "Skip to workspace" }),
    ).toHaveAttribute("href", "#workspace-main");
    expect(
      screen.getByRole("status", { name: "Local save status" }),
    ).toHaveAttribute("aria-live", "polite");
    expect(
      screen.getByRole("status", { name: "Local save status" }),
    ).toHaveTextContent("Saved locally");
    expect(screen.getByRole("main")).toHaveAttribute("id", "workspace-main");
    expect(screen.getByRole("main")).toHaveAttribute("tabindex", "-1");
  });

  test("keeps the in-memory shell usable while persistence failure stays visible", () => {
    renderApp(<App />, {
      storage: makeThrowingStorage({
        get: new DOMException("Blocked", "SecurityError"),
      }),
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Local storage is unavailable; work will be lost on reload.",
    );
    expect(screen.getByRole("tab", { name: "Timeline" })).toBeVisible();
    expect(screen.getByRole("main")).toBeVisible();
  });
});

describe("responsive rails and shared evidence primitives", () => {
  test("exposes labeled rail controls in compact layouts", () => {
    installCompactViewport(true);
    renderApp(<App />, { storage: makeMemoryStorage() });

    expect(screen.getByRole("button", { name: "Case facts" })).toHaveAttribute(
      "aria-controls",
      "case-facts-rail",
    );
    expect(screen.getByRole("button", { name: "Case facts" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByRole("button", { name: "Teaching" })).toHaveAttribute(
      "aria-controls",
      "teaching-rail",
    );
  });

  test("traps focus in a compact rail, closes it, and returns focus", async () => {
    installCompactViewport(true);
    const user = userEvent.setup();
    renderApp(<App />, { storage: makeMemoryStorage() });

    const trigger = screen.getByRole("button", { name: "Case facts" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Case facts" });
    const close = within(dialog).getByRole("button", {
      name: "Close Case facts",
    });
    expect(close).toHaveFocus();
    expect(document.querySelector(".header")).toHaveAttribute("inert");
    expect(document.querySelector(".tab-strip")).toHaveAttribute("inert");
    expect(document.querySelector(".workspace-main")).toHaveAttribute("inert");

    await user.tab();
    expect(
      within(dialog).getByRole("button", { name: "Add fictional fact" }),
    ).toHaveFocus();

    close.focus();
    await user.tab({ shift: true });
    expect(
      within(dialog).getByRole("button", { name: "Edit F10" }),
    ).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Case facts" })).toBeNull();
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    await user.click(
      within(screen.getByRole("dialog", { name: "Case facts" })).getByRole(
        "button",
        { name: "Close Case facts" },
      ),
    );
    expect(screen.queryByRole("dialog", { name: "Case facts" })).toBeNull();
    expect(trigger).toHaveFocus();
  });

  test.each(["Escape", "X"] as const)(
    "returns evidence-overlay focus to the invoking FactChip after %s close",
    async (closeMethod) => {
      installCompactViewport(true);
      const user = userEvent.setup();
      renderApp(
        <AppShell activeTab="timeline" onTabChange={() => undefined}>
          <FactChip factId="F01" />
        </AppShell>,
        { storage: makeMemoryStorage() },
      );

      const chip = screen.getByRole("button", { name: "F01" });
      await user.click(chip);
      const dialog = screen.getByRole("dialog", { name: "Case facts" });

      if (closeMethod === "Escape") {
        await user.keyboard("{Escape}");
      } else {
        await user.click(
          within(dialog).getByRole("button", { name: "Close Case facts" }),
        );
      }

      expect(
        screen.queryByRole("dialog", { name: "Case facts" }),
      ).not.toBeInTheDocument();
      expect(chip).toHaveFocus();
    },
  );

  test("uses the shared fact controller and preserves LinkedText fact order", async () => {
    installCompactViewport(false);
    const user = userEvent.setup();
    renderApp(
      <div>
        <FactChip factId="F01" />
        <LinkedText text="Linked evidence" factIds={["F02", "F03"]} />
      </div>,
      { storage: makeMemoryStorage() },
    );

    const factChips = screen.getAllByRole("button");
    expect(factChips.map((chip) => chip.textContent)).toEqual([
      "F01",
      "F02",
      "F03",
    ]);
    const factChip = screen.getByRole("button", { name: "F01" });
    expect(factChip).toHaveAttribute("aria-pressed", "false");

    await user.click(factChip);
    expect(factChip).toHaveAttribute("aria-pressed", "true");
    expect(factChip).toHaveClass("is-selected");
  });

  test("labels reliability with text so state is not color-only", () => {
    renderApp(<SourceReliability reliability="moderate" />, {
      storage: makeMemoryStorage(),
    });

    expect(screen.getByText("Moderate")).toHaveAttribute(
      "aria-label",
      "Reliability: Moderate",
    );
  });
});
