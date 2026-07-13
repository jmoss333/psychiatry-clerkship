import { Button } from "./ui/Button";

type WorkspaceRecoveryProps = {
  message: string;
  persistenceError: string | null;
  onReset: () => void;
};

export function WorkspaceRecovery({
  message,
  persistenceError,
  onReset,
}: WorkspaceRecoveryProps) {
  return (
    <main className="failure-screen">
      <div className="failure-screen__content">
        <h1>Saved fictional workspace needs to be reset</h1>
        <p>{message}</p>
        {persistenceError ? <p role="alert">{persistenceError}</p> : null}
        <Button variant="primary" onClick={onReset}>
          Reset fictional workspace
        </Button>
      </div>
    </main>
  );
}
