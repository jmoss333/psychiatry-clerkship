import AlertTriangle from "lucide-react/dist/esm/icons/alert-triangle.mjs";
import CheckCircle2 from "lucide-react/dist/esm/icons/check-circle-2.mjs";
import Download from "lucide-react/dist/esm/icons/download.mjs";
import LoaderCircle from "lucide-react/dist/esm/icons/loader-circle.mjs";
import type { SaveStatus } from "../state/WorkspaceProvider";
import { useWorkspace } from "../state/useWorkspace";
import { Button } from "./ui/Button";

type SaveIndicatorProps = {
  saveStatus: SaveStatus;
  persistenceError: string | null;
};

const iconProps = {
  "aria-hidden": true,
  color: "currentColor",
  size: 18,
  strokeWidth: 1.5,
} as const;

function SaveIndicator({ saveStatus, persistenceError }: SaveIndicatorProps) {
  if (persistenceError) {
    return (
      <span
        className="save-indicator save-indicator--error"
        role="alert"
        aria-label="Local save status"
      >
        <AlertTriangle {...iconProps} />
        {persistenceError}
      </span>
    );
  }

  const saving = saveStatus === "saving";
  return (
    <span
      className="save-indicator"
      role="status"
      aria-label="Local save status"
      aria-live="polite"
      aria-atomic="true"
    >
      {saving ? (
        <LoaderCircle className="save-indicator__spinner" {...iconProps} />
      ) : (
        <CheckCircle2 {...iconProps} />
      )}
      {saving ? "Saving locally" : "Saved locally"}
    </span>
  );
}

type HeaderProps = {
  inert: boolean;
};

export function Header({ inert }: HeaderProps) {
  const { content, dispatch, persistenceError, saveStatus, workspace } =
    useWorkspace();

  return (
    <header className="header" inert={inert}>
      <div className="header__identity">
        <h1>Clinical Reasoning Workbench</h1>
        <span className="header__divider" aria-hidden="true" />
        <p>{content.caseDefinition.learnerTitle}</p>
      </div>
      <div className="header__utilities">
        <select
          className="learner-select"
          aria-label="Learner level"
          value={workspace.learnerLevel}
          onChange={(event) =>
            dispatch({
              type: "setLearnerLevel",
              level: event.target.value === "resident" ? "resident" : "ms3",
            })
          }
        >
          <option value="ms3">MS3</option>
          <option value="resident">Resident</option>
        </select>
        <span className="fictional-label">Fictional educational case</span>
        <SaveIndicator
          saveStatus={saveStatus}
          persistenceError={persistenceError}
        />
        <Button className="export-button">
          <Download {...iconProps} />
          Export summary
        </Button>
      </div>
    </header>
  );
}
