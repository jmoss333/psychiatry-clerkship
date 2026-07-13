import {
  useEffect,
  useRef,
  type KeyboardEvent,
  type PropsWithChildren,
} from "react";

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), select:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

type TimelineDialogProps = PropsWithChildren<{
  labelledBy: string;
  onClose: () => void;
}>;

export function TimelineDialog({
  children,
  labelledBy,
  onClose,
}: TimelineDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const background = document.querySelector<HTMLElement>(
      ".synthetic-gate-background",
    );
    const wasInert = background?.hasAttribute("inert") ?? false;
    background?.setAttribute("inert", "");
    const first =
      dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    first?.focus();
    return () => {
      if (!wasInert) background?.removeAttribute("inert");
    };
  }, []);

  const containFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ??
        [],
    );
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="modal-backdrop">
      <div
        ref={dialogRef}
        className="modal-dialog timeline-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onKeyDown={containFocus}
      >
        {children}
      </div>
    </div>
  );
}
