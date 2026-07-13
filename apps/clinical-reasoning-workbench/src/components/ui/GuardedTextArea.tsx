import {
  forwardRef,
  useImperativeHandle,
  useRef,
  type ComponentPropsWithoutRef,
} from "react";
import { useSyntheticDataGate } from "../../state/useSyntheticDataGate";
import { useWorkspace } from "../../state/useWorkspace";

export type GuardedTextAreaProps = ComponentPropsWithoutRef<"textarea">;

export const GuardedTextArea = forwardRef<
  HTMLTextAreaElement,
  GuardedTextAreaProps
>(function GuardedTextArea(
  { onFocus, onKeyDown, onPointerDown, readOnly: requestedReadOnly, ...props },
  forwardedRef,
) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { workspace } = useWorkspace();
  const { guardFreeTextEdit } = useSyntheticDataGate();
  const guarded = !workspace.syntheticDataAcknowledged;

  useImperativeHandle(
    forwardedRef,
    () => textareaRef.current as HTMLTextAreaElement,
  );

  const requestEditing = () => {
    guardFreeTextEdit(() => textareaRef.current?.focus());
  };

  return (
    <textarea
      {...props}
      ref={textareaRef}
      readOnly={guarded || requestedReadOnly}
      aria-readonly={guarded || requestedReadOnly ? true : undefined}
      onPointerDown={(event) => {
        onPointerDown?.(event);
        if (!guarded || event.defaultPrevented) return;
        event.preventDefault();
        requestEditing();
      }}
      onFocus={(event) => {
        onFocus?.(event);
        if (guarded) {
          const previous = event.relatedTarget;
          if (previous instanceof HTMLElement && previous.isConnected) {
            previous.focus();
          }
          requestEditing();
        }
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (
          guarded &&
          !event.defaultPrevented &&
          !event.altKey &&
          !event.ctrlKey &&
          !event.metaKey &&
          (event.key.length === 1 || event.key === "Enter")
        ) {
          event.preventDefault();
          requestEditing();
        }
      }}
    />
  );
});
