import BookOpen from "lucide-react/dist/esm/icons/book-open.mjs";
import FileText from "lucide-react/dist/esm/icons/file-text.mjs";
import X from "lucide-react/dist/esm/icons/x.mjs";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PropsWithChildren,
  type RefObject,
} from "react";
import { useWorkspace } from "../state/useWorkspace";
import { Header } from "./Header";
import { EvidenceDrawer } from "./EvidenceDrawer";
import { TabNav, type WorkbenchTab } from "./TabNav";
import { TeachingPanel } from "./TeachingPanel";
import { Button } from "./ui/Button";

const COMPACT_QUERY = "(max-width: 1099px)";
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), select:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

const iconProps = {
  "aria-hidden": true,
  color: "currentColor",
  size: 18,
  strokeWidth: 1.5,
} as const;

function useCompactLayout() {
  const [isCompact, setIsCompact] = useState(
    () =>
      typeof window.matchMedia === "function" &&
      window.matchMedia(COMPACT_QUERY).matches,
  );

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(COMPACT_QUERY);
    const update = (event: MediaQueryListEvent) => setIsCompact(event.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return isCompact;
}

function useThemeMessages() {
  useEffect(() => {
    const receiveTheme = (event: MessageEvent<unknown>) => {
      if (typeof event.data !== "object" || event.data === null) return;
      const data = event.data as { type?: unknown; mode?: unknown };
      if (
        data.type !== "theme" ||
        (data.mode !== "light" && data.mode !== "dark")
      ) {
        return;
      }

      document.documentElement.dataset.theme = data.mode;
      try {
        window.localStorage.setItem("cw_theme", data.mode);
      } catch {
        // The frame theme still applies when storage is blocked.
      }
    };

    window.addEventListener("message", receiveTheme);
    return () => window.removeEventListener("message", receiveTheme);
  }, []);
}

type RailProps = PropsWithChildren<{
  className: string;
  compact: boolean;
  heading: string;
  headingId: string;
  id: string;
  open: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
}>;

function Rail({
  children,
  className,
  compact,
  heading,
  headingId,
  id,
  open,
  onClose,
  triggerRef,
}: RailProps) {
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  const visible = !compact || open;

  useEffect(() => {
    if (!compact) return;
    const rememberFocusedElement = (event: FocusEvent) => {
      const target = event.target;
      if (
        !open &&
        target instanceof HTMLElement &&
        !panelRef.current?.contains(target)
      ) {
        returnFocusRef.current = target;
      }
    };
    document.addEventListener("focusin", rememberFocusedElement);
    return () =>
      document.removeEventListener("focusin", rememberFocusedElement);
  }, [compact, open]);

  useEffect(() => {
    const overlayIsOpen = compact && open;
    const overlayWasOpen = wasOpenRef.current;
    const panel = panelRef.current;

    if (overlayIsOpen && !overlayWasOpen) {
      const activeElement =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      if (activeElement && !panel?.contains(activeElement)) {
        returnFocusRef.current = activeElement;
      }
      if (!panel?.contains(document.activeElement)) {
        closeRef.current?.focus();
      }
    } else if (!overlayIsOpen && overlayWasOpen) {
      const remembered = returnFocusRef.current;
      const fallback = triggerRef.current;
      const destination = remembered?.isConnected
        ? remembered
        : fallback?.isConnected
          ? fallback
          : null;
      destination?.focus();
      returnFocusRef.current = null;
    }

    wasOpenRef.current = overlayIsOpen;
  }, [compact, open, triggerRef]);

  const containFocus = (event: KeyboardEvent<HTMLElement>) => {
    if (!compact || !open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [],
    );
    if (focusable.length === 0) {
      event.preventDefault();
      panelRef.current?.focus();
      return;
    }
    const first = focusable[0]!;
    const last = focusable.at(-1)!;
    if (focusable.length === 1) {
      event.preventDefault();
      first.focus();
      return;
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <aside
      ref={panelRef}
      id={id}
      className={`${className} ${compact ? "rail--overlay" : ""}`.trim()}
      hidden={!visible}
      aria-labelledby={headingId}
      role={compact ? "dialog" : undefined}
      aria-modal={compact ? true : undefined}
      tabIndex={compact ? -1 : undefined}
      onKeyDown={containFocus}
    >
      <div className="rail__header">
        <h2 id={headingId}>{heading}</h2>
        {compact ? (
          <Button
            ref={closeRef}
            className="rail__close"
            variant="ghost"
            aria-label={`Close ${heading}`}
            onClick={onClose}
          >
            <X {...iconProps} />
          </Button>
        ) : null}
      </div>
      <div className="rail__body">{children}</div>
    </aside>
  );
}

type AppShellProps = PropsWithChildren<{
  activeTab: WorkbenchTab;
  onTabChange: (tab: WorkbenchTab) => void;
}>;

export function AppShell({ activeTab, children, onTabChange }: AppShellProps) {
  const { closeEvidencePanel, evidencePanelOpen, openEvidencePanel } =
    useWorkspace();
  const [teachingOpen, setTeachingOpen] = useState(false);
  const evidenceTriggerRef = useRef<HTMLButtonElement>(null);
  const teachingTriggerRef = useRef<HTMLButtonElement>(null);
  const compact = useCompactLayout();
  const teachingVisible = teachingOpen && !evidencePanelOpen;
  const overlayOpen = compact && (evidencePanelOpen || teachingVisible);
  useThemeMessages();

  return (
    <div className="workbench">
      <a className="skip-link" href="#workspace-main">
        Skip to workspace
      </a>
      <Header inert={overlayOpen} />
      <div className="tab-strip" inert={overlayOpen}>
        <TabNav activeTab={activeTab} onTabChange={onTabChange} />
        {compact ? (
          <div className="rail-controls">
            <Button
              ref={evidenceTriggerRef}
              variant="ghost"
              aria-controls="case-facts-rail"
              aria-expanded={evidencePanelOpen}
              onClick={() => {
                setTeachingOpen(false);
                openEvidencePanel();
              }}
            >
              <FileText {...iconProps} />
              Case facts
            </Button>
            <Button
              ref={teachingTriggerRef}
              variant="ghost"
              aria-controls="teaching-rail"
              aria-expanded={teachingVisible}
              onClick={() => {
                closeEvidencePanel();
                setTeachingOpen(true);
              }}
            >
              <BookOpen {...iconProps} />
              Teaching
            </Button>
          </div>
        ) : null}
      </div>
      <div className="workspace-grid">
        <Rail
          id="case-facts-rail"
          className="evidence-rail"
          compact={compact}
          heading="Case facts"
          headingId="case-facts-heading"
          open={evidencePanelOpen}
          onClose={closeEvidencePanel}
          triggerRef={evidenceTriggerRef}
        >
          <EvidenceDrawer />
        </Rail>
        <main
          id="workspace-main"
          tabIndex={-1}
          className="workspace-main"
          inert={overlayOpen}
        >
          {children}
        </main>
        <Rail
          id="teaching-rail"
          className="teaching-rail"
          compact={compact}
          heading="Teaching"
          headingId="teaching-heading"
          open={teachingVisible}
          onClose={() => setTeachingOpen(false)}
          triggerRef={teachingTriggerRef}
        >
          <TeachingPanel />
        </Rail>
      </div>
    </div>
  );
}
