import { render } from "@testing-library/react";
import type { RenderResult } from "@testing-library/react";
import type { ReactElement } from "react";
import type { RuntimeContent } from "../content/loadContent";
import type { WorkspaceState } from "../domain/model";
import type { PreviewSelection } from "../domain/query";
import { SyntheticDataGateProvider } from "../state/SyntheticDataGateProvider";
import { WorkspaceProvider } from "../state/WorkspaceProvider";

export type RenderAppOptions = {
  workspace?: WorkspaceState;
  storage?: Storage;
  previewSelection?: PreviewSelection;
  content?: RuntimeContent;
};

export function renderApp(
  ui: ReactElement,
  options: RenderAppOptions = {},
): RenderResult {
  return render(
    <WorkspaceProvider
      initialWorkspace={options.workspace}
      storage={options.storage}
      previewSelection={options.previewSelection}
      content={options.content}
    >
      <SyntheticDataGateProvider>{ui}</SyntheticDataGateProvider>
    </WorkspaceProvider>,
  );
}
