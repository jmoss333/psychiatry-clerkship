type ContentErrorScreenProps = {
  message: string;
};

export function ContentErrorScreen({ message }: ContentErrorScreenProps) {
  return (
    <main className="failure-screen" role="alert">
      <div className="failure-screen__content">
        <h1>Workbench content could not be loaded</h1>
        <p>{message}</p>
      </div>
    </main>
  );
}
