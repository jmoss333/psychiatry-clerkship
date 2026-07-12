import { render, screen } from "@testing-library/react";
import { App } from "./App";

test("renders the product boundary before any case workflow", () => {
  render(<App />);
  expect(
    screen.getByRole("heading", { name: "Clinical Reasoning Workbench" }),
  ).toBeVisible();
  expect(screen.getByText("Fictional educational case")).toBeVisible();
});
