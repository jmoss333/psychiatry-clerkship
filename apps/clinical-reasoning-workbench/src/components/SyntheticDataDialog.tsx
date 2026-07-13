import { useEffect, useRef, type KeyboardEvent } from "react";
import { Button } from "./ui/Button";

type SyntheticDataDialogProps = {
  onCancel: () => void;
  onContinue: () => void;
};

export function SyntheticDataDialog({
  onCancel,
  onContinue,
}: SyntheticDataDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    continueRef.current?.focus();
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== "Tab") return;

    if (event.shiftKey && document.activeElement === continueRef.current) {
      event.preventDefault();
      cancelRef.current?.focus();
    } else if (
      !event.shiftKey &&
      document.activeElement === cancelRef.current
    ) {
      event.preventDefault();
      continueRef.current?.focus();
    }
  };

  return (
    <div className="modal-backdrop">
      <div
        ref={dialogRef}
        className="modal-dialog synthetic-data-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="synthetic-data-dialog-title"
        onKeyDown={handleKeyDown}
      >
        <h2 id="synthetic-data-dialog-title">Fictional data only</h2>
        <p>I will use fictional educational data only.</p>
        <div className="modal-dialog__actions">
          <Button ref={continueRef} variant="primary" onClick={onContinue}>
            Continue with fictional data
          </Button>
          <Button ref={cancelRef} onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
