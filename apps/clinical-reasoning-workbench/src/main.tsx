import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ContentErrorScreen } from "./components/ContentErrorScreen";
import { loadRuntimeContent } from "./content/loadContent";
import { WorkspaceProvider } from "./state/WorkspaceProvider";
import "./styles/base.css";

const root = createRoot(document.getElementById("root")!);

try {
  const content = loadRuntimeContent();
  root.render(
    <StrictMode>
      <WorkspaceProvider content={content}>
        <App />
      </WorkspaceProvider>
    </StrictMode>,
  );
} catch (error) {
  const message =
    error instanceof Error ? error.message : "Unknown authored-content error";
  root.render(<ContentErrorScreen message={message} />);
}
