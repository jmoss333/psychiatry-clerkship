import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { SyntheticDataDialog } from "../components/SyntheticDataDialog";
import {
  SyntheticDataGateContext,
  type SyntheticDataGateValue,
} from "./useSyntheticDataGate";
import { useWorkspace } from "./useWorkspace";

export function SyntheticDataGateProvider({ children }: PropsWithChildren) {
  const { dispatch, workspace } = useWorkspace();
  const [open, setOpen] = useState(false);
  const continuationRef = useRef<(() => void) | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const guardFreeTextEdit = useCallback(
    (resume: () => void) => {
      if (workspace.syntheticDataAcknowledged) {
        resume();
        return;
      }
      if (continuationRef.current) return;

      continuationRef.current = resume;
      returnFocusRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      setOpen(true);
    },
    [workspace.syntheticDataAcknowledged],
  );

  const cancel = useCallback(() => {
    continuationRef.current = null;
    const returnFocus = returnFocusRef.current;
    returnFocusRef.current = null;
    setOpen(false);
    queueMicrotask(() => {
      if (
        returnFocus?.isConnected &&
        !(returnFocus instanceof HTMLTextAreaElement && returnFocus.readOnly)
      ) {
        returnFocus.focus();
      }
    });
  }, []);

  const continueWithFictionalData = useCallback(() => {
    const resume = continuationRef.current;
    continuationRef.current = null;
    returnFocusRef.current = null;
    dispatch({ type: "acknowledgeSyntheticData" });
    setOpen(false);
    if (resume) queueMicrotask(resume);
  }, [dispatch]);

  const value = useMemo<SyntheticDataGateValue>(
    () => ({ guardFreeTextEdit }),
    [guardFreeTextEdit],
  );

  return (
    <SyntheticDataGateContext.Provider value={value}>
      <div
        className="synthetic-gate-background"
        inert={open ? true : undefined}
      >
        {children}
      </div>
      {open ? (
        <SyntheticDataDialog
          onCancel={cancel}
          onContinue={continueWithFictionalData}
        />
      ) : null}
    </SyntheticDataGateContext.Provider>
  );
}
