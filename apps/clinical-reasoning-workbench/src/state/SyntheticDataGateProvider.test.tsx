import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";
import { renderApp } from "../test/renderApp";
import { GuardedTextArea } from "../components/ui/GuardedTextArea";
import { useSyntheticDataGate } from "./useSyntheticDataGate";

function ControlledTextArea() {
  const [value, setValue] = useState("");
  return (
    <>
      <button type="button">Before field</button>
      <GuardedTextArea
        aria-label="Reasoning text"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
    </>
  );
}

function ContinuationProbe({ calls }: { calls: string[] }) {
  const { guardFreeTextEdit } = useSyntheticDataGate();
  return (
    <button
      type="button"
      onClick={() => {
        guardFreeTextEdit(() => calls.push("first"));
        guardFreeTextEdit(() => calls.push("second"));
      }}
    >
      Queue continuations
    </button>
  );
}

describe("shared synthetic-data gate", () => {
  test("keeps GuardedTextArea read-only and shows one exact prompt for pointer, focus, and typing attempts", async () => {
    const user = userEvent.setup();
    renderApp(<ControlledTextArea />);
    const textarea = screen.getByLabelText("Reasoning text");
    expect(textarea).toHaveAttribute("readonly");

    await user.click(screen.getByRole("button", { name: "Before field" }));
    fireEvent.pointerDown(textarea);
    fireEvent.focus(textarea);
    fireEvent.keyDown(textarea, { key: "x" });

    const dialogs = screen.getAllByRole("dialog", {
      name: "Fictional data only",
    });
    expect(dialogs).toHaveLength(1);
    expect(
      within(dialogs[0]!).getByText(
        "I will use fictional educational data only.",
      ),
    ).toBeVisible();
    expect(
      within(dialogs[0]!).getByRole("button", {
        name: "Continue with fictional data",
      }),
    ).toHaveFocus();
  });

  test("continues once, unlocks the field, and refocuses it only after acknowledgement", async () => {
    const user = userEvent.setup();
    renderApp(<ControlledTextArea />);
    const before = screen.getByRole("button", { name: "Before field" });
    const textarea = screen.getByLabelText("Reasoning text");
    before.focus();
    await user.pointer({ target: textarea, keys: "[MouseLeft]" });

    expect(textarea).not.toHaveFocus();
    await user.click(
      screen.getByRole("button", { name: "Continue with fictional data" }),
    );
    await waitFor(() => expect(textarea).toHaveFocus());
    expect(textarea).not.toHaveAttribute("readonly");
    await user.type(textarea, "Synthetic reasoning");
    expect(textarea).toHaveValue("Synthetic reasoning");

    await user.click(before);
    await user.click(textarea);
    expect(
      screen.queryByRole("dialog", { name: "Fictional data only" }),
    ).toBeNull();
  });

  test("returns keyboard focus to the prior control when a guarded focus attempt is cancelled", async () => {
    const user = userEvent.setup();
    renderApp(<ControlledTextArea />);
    const before = screen.getByRole("button", { name: "Before field" });
    before.focus();

    await user.tab();
    expect(
      screen.getByRole("dialog", { name: "Fictional data only" }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(before).toHaveFocus();
    expect(
      screen.queryByRole("dialog", { name: "Fictional data only" }),
    ).toBeNull();
  });

  test("keeps only the first pending continuation", async () => {
    const user = userEvent.setup();
    const calls: string[] = [];
    renderApp(<ContinuationProbe calls={calls} />);

    await user.click(
      screen.getByRole("button", { name: "Queue continuations" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Continue with fictional data" }),
    );
    await waitFor(() => expect(calls).toEqual(["first"]));
  });

  test.each(["Cancel", "Escape"] as const)(
    "%s discards the continuation without refocusing or reopening a guarded textarea",
    async (method) => {
      const user = userEvent.setup();
      renderApp(<ControlledTextArea />);
      const before = screen.getByRole("button", { name: "Before field" });
      const textarea = screen.getByLabelText("Reasoning text");
      before.focus();
      await user.pointer({ target: textarea, keys: "[MouseLeft]" });

      if (method === "Cancel") {
        await user.click(screen.getByRole("button", { name: "Cancel" }));
      } else {
        await user.keyboard("{Escape}");
      }

      expect(
        screen.queryByRole("dialog", { name: "Fictional data only" }),
      ).toBeNull();
      expect(textarea).toHaveAttribute("readonly");
      expect(textarea).not.toHaveFocus();
      expect(before).toHaveFocus();
    },
  );

  test("traps focus, stops Escape propagation, and returns focus to a button trigger", async () => {
    const user = userEvent.setup();
    const onOuterKeyDown = vi.fn();
    const calls: string[] = [];
    renderApp(
      <div onKeyDown={onOuterKeyDown}>
        <ContinuationProbe calls={calls} />
      </div>,
    );

    const trigger = screen.getByRole("button", { name: "Queue continuations" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Fictional data only" });
    const continueButton = within(dialog).getByRole("button", {
      name: "Continue with fictional data",
    });
    const cancelButton = within(dialog).getByRole("button", { name: "Cancel" });
    expect(continueButton).toHaveFocus();
    await user.tab();
    expect(cancelButton).toHaveFocus();
    await user.tab();
    expect(continueButton).toHaveFocus();
    await user.keyboard("{Escape}");

    expect(onOuterKeyDown).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();
    expect(calls).toEqual([]);
  });

  test("marks the underlying application inert while the gate is open", async () => {
    const user = userEvent.setup();
    renderApp(<ContinuationProbe calls={[]} />);
    await user.click(
      screen.getByRole("button", { name: "Queue continuations" }),
    );
    expect(
      document.querySelector(".synthetic-gate-background"),
    ).toHaveAttribute("inert");
  });
});
