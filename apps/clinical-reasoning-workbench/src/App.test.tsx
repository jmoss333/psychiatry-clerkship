import { screen } from "@testing-library/react";
import { App } from "./App";
import { ContentErrorScreen } from "./components/ContentErrorScreen";
import { makeMemoryStorage } from "./test/fixtures";
import { renderApp } from "./test/renderApp";

test("renders the product boundary before any case workflow", () => {
  renderApp(<App />, { storage: makeMemoryStorage() });
  expect(
    screen.getByRole("heading", { name: "Clinical Reasoning Workbench" }),
  ).toBeVisible();
  expect(screen.getByText("Fictional educational case")).toBeVisible();
});

test("authored-content failure renders no partial shell", () => {
  renderApp(
    <ContentErrorScreen message="first-episode.json: Invalid authored fact" />,
    { storage: makeMemoryStorage() },
  );

  expect(screen.getByRole("alert")).toHaveTextContent(
    "first-episode.json: Invalid authored fact",
  );
  expect(
    screen.getByRole("heading", {
      name: "Workbench content could not be loaded",
    }),
  ).toBeVisible();
  expect(
    screen.queryByRole("tab", { name: "Timeline" }),
  ).not.toBeInTheDocument();
});
